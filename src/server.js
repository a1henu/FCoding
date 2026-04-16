import http from 'node:http';
import { URL } from 'node:url';
import { runCodexTask, formatCodexResult } from './codex/runner.js';
import { decryptPayload, verifySignature } from './feishu/crypto.js';
import {
  EventDeduper,
  FeishuAuthError,
  extractCodexTask,
  parseFeishuPayload
} from './feishu/events.js';

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

export async function processCodexTask({ task, config, feishuClient, codexRunner, logger }) {
  try {
    if (config.feishu.sendAck) {
      await feishuClient.replyText(task.messageId, 'Received. Codex is working on it.');
    }

    const result = await codexRunner({
      prompt: task.prompt,
      ...config.codex
    });
    await feishuClient.replyText(task.messageId, formatCodexResult(result));
  } catch (error) {
    logger.error({ error, eventId: task.eventId }, 'Codex task failed');
    try {
      await feishuClient.replyText(
        task.messageId,
        `Codex bridge failed before completion.\n\n${error.message}`
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
        processCodexTask({ task, config, feishuClient, codexRunner, logger });
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
