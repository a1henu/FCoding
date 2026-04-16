import http from 'node:http';
import { URL } from 'node:url';
import { runCodexTask } from './codex/runner.js';
import { handleBotCommand } from './commands.js';
import { createRuntimeState } from './runtime-state.js';
import { decryptPayload, verifySignature } from './feishu/crypto.js';
import {
  EventDeduper,
  FeishuAuthError,
  extractCodexTask,
  parseFeishuPayload
} from './feishu/events.js';
import {
  buildCommandResultCard,
  buildRunningTaskCard,
  buildTaskStatusCard
} from './feishu/cards.js';

export function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

export function readRequestBody(request, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function parseIncomingFeishuBody(rawBody, headers, config) {
  if (config.verifyFeishuSignature) {
    const valid = verifySignature({
      timestamp: headers['x-lark-request-timestamp'],
      nonce: headers['x-lark-request-nonce'],
      signature: headers['x-lark-signature'],
      encryptKey: config.feishu.encryptKey,
      body: rawBody
    });

    if (!valid) {
      throw new FeishuAuthError('Invalid Feishu request signature');
    }
  }

  const envelope = JSON.parse(rawBody || '{}');
  if (envelope.encrypt) {
    return decryptPayload(envelope.encrypt, config.feishu.encryptKey);
  }

  return envelope;
}

export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function startProgressReplies({
  task,
  feishuClient,
  intervalMs,
  runtimeState,
  logger = console,
  now = () => Date.now()
}) {
  if (!intervalMs || intervalMs <= 0) {
    return () => {};
  }

  const startedAt = now();
  let inFlight = false;
  const timer = setInterval(async () => {
    if (inFlight) {
      return;
    }

    inFlight = true;
    try {
      await feishuClient.replyInteractiveCard(
        task.messageId,
        buildRunningTaskCard({
          task,
          runtime: runtimeState.snapshot(),
          taskId: task.activeTaskId,
          elapsed: formatElapsed(now() - startedAt)
        })
      );
    } catch (error) {
      logger.error({ error, eventId: task.eventId }, 'Failed to send Codex progress update');
    } finally {
      inFlight = false;
    }
  }, intervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}

function normalizeErrorMessage(error) {
  return error?.message || String(error);
}

export async function processCodexTask({
  task,
  config,
  feishuClient,
  codexRunner,
  runtimeState,
  logger
}) {
  let stopProgressReplies = () => {};
  let activeTaskId = null;

  try {
    const commandResult = await handleBotCommand({ task, runtimeState, logger });
    if (commandResult.handled) {
      await feishuClient.replyInteractiveCard(task.messageId, commandResult.card);
      return;
    }

    const abortController = new AbortController();
    activeTaskId = runtimeState.registerActiveTask(task, () => abortController.abort());
    task.activeTaskId = activeTaskId;

    if (config.feishu.sendAck) {
      await feishuClient.replyInteractiveCard(
        task.messageId,
        buildRunningTaskCard({
          task,
          runtime: runtimeState.snapshot(),
          taskId: activeTaskId
        })
      );
    }

    stopProgressReplies = startProgressReplies({
      task,
      feishuClient,
      intervalMs: config.codex.progressIntervalMs,
      runtimeState,
      logger
    });

    const result = await codexRunner({
      prompt: task.prompt,
      signal: abortController.signal,
      ...runtimeState.buildCodexRunOptions(config.codex)
    });
    stopProgressReplies();
    runtimeState.finishActiveTask(activeTaskId);
    activeTaskId = null;

    const cardId = runtimeState.createCardState('task_result', {
      task,
      result
    });
    await feishuClient.replyInteractiveCard(
      task.messageId,
      buildTaskStatusCard({
        task,
        runtime: runtimeState.snapshot(),
        result,
        cardId,
        expanded: false
      })
    );
  } catch (error) {
    stopProgressReplies();
    if (activeTaskId) {
      runtimeState.finishActiveTask(activeTaskId);
    }
    logger.error({ error, eventId: task.eventId }, 'Codex task failed');
    try {
      await feishuClient.replyInteractiveCard(
        task.messageId,
        buildCommandResultCard({
          title: 'FCoding task failed',
          status: 'error',
          summary: 'FCoding failed before completion.',
          details: [normalizeErrorMessage(error)]
        })
      );
    } catch (replyError) {
      logger.error({ error: replyError, eventId: task.eventId }, 'Failed to report task error to Feishu');
    }
  }
}

export function createServer({
  config,
  feishuClient,
  codexRunner = runCodexTask,
  deduper = new EventDeduper(),
  runtimeState = createRuntimeState({ config }),
  logger = console
}) {
  async function handleFeishuCallback(request, response) {
    let payload;
    try {
      const rawBody = await readRequestBody(request, config.bodyLimitBytes);
      payload = parseIncomingFeishuBody(rawBody, request.headers, config);
      const parsed = parseFeishuPayload(payload, {
        verificationToken: config.feishu.verificationToken
      });

      if (parsed.kind === 'url_verification') {
        sendJson(response, 200, { challenge: parsed.challenge });
        return;
      }

      if (parsed.kind !== 'message') {
        sendJson(response, 200, { ok: true, ignored: true, reason: parsed.kind });
        return;
      }

      if (deduper.seen(parsed.eventId)) {
        sendJson(response, 200, { ok: true, duplicate: true });
        return;
      }

      const task = extractCodexTask(parsed, config.access);
      if (!task) {
        sendJson(response, 200, { ok: true, ignored: true });
        return;
      }

      sendJson(response, 200, { ok: true, accepted: true });
      setImmediate(() => {
        processCodexTask({
          task,
          config,
          feishuClient,
          codexRunner,
          runtimeState,
          logger
        });
      });
    } catch (error) {
      const status = error instanceof FeishuAuthError ? 401 : 400;
      logger.error({ error }, 'Failed to handle Feishu callback');
      sendJson(response, status, { ok: false, error: error.message });
    }
  }

  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/healthz') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === config.callbackPath) {
      handleFeishuCallback(request, response);
      return;
    }

    sendJson(response, 404, { ok: false, error: 'not_found' });
  });
}
