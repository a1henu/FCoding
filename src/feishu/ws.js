import * as Lark from '@larksuiteoapi/node-sdk';
import { EventDeduper, extractCodexTask } from './events.js';
import { processCodexTask } from '../server.js';
import {
  buildCallbackReceivedCard,
  buildCallbackTestCard,
  buildCommandResultCard,
  buildTaskStatusCard
} from './cards.js';
import { runCodexTask } from '../codex/runner.js';
import { createRuntimeState } from '../runtime-state.js';

export function normalizeWsMessageEvent(data) {
  const message = data?.message || {};
  const sender = data?.sender || {};
  const eventId = data?.event_id
    || data?.header?.event_id
    || message.message_id
    || `${message.chat_id || 'unknown'}:${message.create_time || Date.now()}`;

  return {
    kind: 'message',
    eventId,
    eventType: 'im.message.receive_v1',
    sender,
    message
  };
}

function buildExpiredCardStateCard() {
  return buildCommandResultCard({
    title: 'FCoding card expired',
    status: 'error',
    summary: 'This card action is no longer available.',
    details: ['Run the command again to generate a fresh card.']
  });
}

export function createCardActionTriggerHandler({
  logger = console,
  runtimeState
} = {}) {
  return async (data) => {
    const value = data?.action?.value || {};
    logger.info?.({ value, openId: data?.operator?.open_id }, 'Received Feishu card action callback');

    if (value.fcoding_action === 'callback_test') {
      return buildCallbackReceivedCard({
        action: value.fcoding_action,
        receivedAt: new Date().toISOString()
      });
    }

    if (value.fcoding_action === 'expand_output' || value.fcoding_action === 'collapse_output') {
      const state = runtimeState?.getCardState(value.card_id);
      if (!state || state.type !== 'task_result') {
        return buildExpiredCardStateCard();
      }

      return buildTaskStatusCard({
        task: state.payload.task,
        runtime: runtimeState.snapshot(),
        result: state.payload.result,
        cardId: value.card_id,
        expanded: value.fcoding_action === 'expand_output'
      });
    }

    if (value.fcoding_action === 'cancel_task') {
      const cancelled = runtimeState?.cancelActiveTask(value.task_id);
      if (!cancelled) {
        return buildCommandResultCard({
          title: 'FCoding task cancel',
          summary: 'This task is no longer running.'
        });
      }

      return buildCommandResultCard({
        title: 'FCoding task cancel requested',
        status: 'running',
        summary: `Cancellation requested for \`${cancelled.prompt}\`.`
      });
    }

    if (value.fcoding_action === 'set_model') {
      const model = String(value.model || '').trim();
      const nextRuntime = model
        ? runtimeState.setModel(model)
        : runtimeState.clearModel();
      return buildCommandResultCard({
        title: model ? 'FCoding model updated' : 'FCoding model cleared',
        status: 'success',
        summary: nextRuntime.model
          ? `Model override set to \`${nextRuntime.model}\`.`
          : 'Model override cleared. Future runs will use the Codex default.'
      });
    }

    return buildCallbackReceivedCard({
      action: value.fcoding_action || 'unknown',
      receivedAt: new Date().toISOString()
    });
  };
}

function isCallbackTestPrompt(prompt) {
  return /^(cardtest|callbacktest|test-card|测试卡片回调)$/i.test(prompt.trim());
}

function getWsPayloadEventType(data) {
  return data?.header?.event_type || data?.event?.type || data?.event_type || data?.type;
}

function isCardActionPayload(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (getWsPayloadEventType(data) === 'card.action.trigger') {
    return true;
  }

  if (data?.event?.action || data?.action) {
    return true;
  }

  return false;
}

function normalizeCardPayloadForSdk(data) {
  if (!data || typeof data !== 'object' || 'encrypt' in data || 'schema' in data || data.headers) {
    return data;
  }

  return {
    ...data,
    headers: {}
  };
}

function parseWsHeaders(headers = []) {
  return headers.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

function encodeWsPayload(payload) {
  return new TextEncoder().encode(JSON.stringify(payload));
}

function decodeWsResultData(result) {
  return Buffer.from(JSON.stringify(result)).toString('base64');
}

async function handleWsCallbackData(wsClient, data, headers, logger) {
  const { message_id: messageId, sum, seq, trace_id: traceId, type } = headers;
  const mergedData = wsClient.dataCache.mergeData({
    message_id: messageId,
    sum: Number(sum),
    seq: Number(seq),
    trace_id: traceId,
    data: data.payload
  });

  if (!mergedData) {
    return;
  }

  logger.info?.({ type, messageId, traceId }, 'Received Feishu WS frame');
  const responsePayload = {
    code: 200
  };
  const startTime = Date.now();

  try {
    const result = await wsClient.eventDispatcher?.invoke(mergedData, { needCheck: false });
    if (result) {
      responsePayload.data = decodeWsResultData(result);
    }
  } catch (error) {
    responsePayload.code = 500;
    logger.error?.({ error, type, messageId, traceId }, 'Failed to handle Feishu WS frame');
  }

  const durationMs = Date.now() - startTime;
  wsClient.sendMessage({
    ...data,
    headers: [...data.headers, { key: 'biz_rt', value: String(durationMs) }],
    payload: encodeWsPayload(responsePayload)
  });
}

export function patchWsClientCardCallbacks(wsClient, { logger = console } = {}) {
  const originalHandleEventData = wsClient.handleEventData?.bind(wsClient);

  wsClient.handleEventData = async (data) => {
    const headers = parseWsHeaders(data?.headers);

    if (headers.type !== 'card') {
      return originalHandleEventData?.(data);
    }

    return handleWsCallbackData(wsClient, data, headers, logger);
  };

  return wsClient;
}

export function createWsEventDispatcher({
  config,
  feishuClient,
  codexRunner = runCodexTask,
  deduper = new EventDeduper(),
  runtimeState = createRuntimeState({ config }),
  logger = console,
  lark = Lark
}) {
  const eventDispatcher = new lark.EventDispatcher({
    encryptKey: config.feishu.encryptKey,
    verificationToken: config.feishu.verificationToken,
    loggerLevel: lark.LoggerLevel?.info
  }).register({
    'im.message.receive_v1': async (data) => {
      const parsed = normalizeWsMessageEvent(data);

      if (deduper.seen(parsed.eventId)) {
        logger.info?.({ eventId: parsed.eventId }, 'Duplicate Feishu WS event ignored');
        return;
      }

      const task = extractCodexTask(parsed, config.access);
      if (!task) {
        logger.info?.({ eventId: parsed.eventId }, 'Feishu WS event ignored');
        return;
      }

      if (isCallbackTestPrompt(task.prompt)) {
        await feishuClient.replyInteractiveCard(
          task.messageId,
          buildCallbackTestCard({ nonce: `${task.eventId}:${Date.now()}` })
        );
        return;
      }

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
    }
  });

  const cardActionHandler = new lark.CardActionHandler({
    encryptKey: config.feishu.encryptKey,
    verificationToken: config.feishu.verificationToken,
    loggerLevel: lark.LoggerLevel?.info
  }, createCardActionTriggerHandler({ logger, runtimeState }));

  return {
    eventDispatcher,
    cardActionHandler,
    async invoke(data, params) {
      const eventType = getWsPayloadEventType(data);
      logger.info?.({ eventType, isCardAction: isCardActionPayload(data) }, 'Received Feishu WS callback');

      if (isCardActionPayload(data)) {
        return cardActionHandler.invoke(normalizeCardPayloadForSdk(data));
      }

      return eventDispatcher.invoke(data, params);
    }
  };
}

export async function startWsEventClient({
  config,
  feishuClient,
  codexRunner = runCodexTask,
  deduper = new EventDeduper(),
  runtimeState = createRuntimeState({ config }),
  logger = console,
  lark = Lark
}) {
  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET are required for WS event mode');
  }

  const wsClient = new lark.WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    loggerLevel: lark.LoggerLevel?.info
  });

  patchWsClientCardCallbacks(wsClient, { logger });

  await wsClient.start({
    eventDispatcher: createWsEventDispatcher({
      config,
      feishuClient,
      codexRunner,
      deduper,
      runtimeState,
      logger,
      lark
    })
  });

  return wsClient;
}
