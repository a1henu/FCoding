import * as Lark from '@larksuiteoapi/node-sdk';
import { EventDeduper, extractCodexTask } from './events.js';
import { processCodexTask } from '../server.js';
import { buildCallbackReceivedCard, buildCallbackTestCard } from './cards.js';
import { runCodexTask } from '../codex/runner.js';

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

export function createCardActionTriggerHandler({ logger = console } = {}) {
  return async (data) => {
    const value = data?.action?.value || {};
    logger.info?.({ value, openId: data?.operator?.open_id }, 'Received Feishu card action callback');

    if (value.fcoding_action === 'callback_test') {
      return buildCallbackReceivedCard({
        action: value.fcoding_action,
        receivedAt: new Date().toISOString()
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

export function createWsEventDispatcher({
  config,
  feishuClient,
  codexRunner = runCodexTask,
  deduper = new EventDeduper(),
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
        processCodexTask({ task, config, feishuClient, codexRunner, logger });
      });
    }
  });

  const cardActionHandler = new lark.CardActionHandler({
    encryptKey: config.feishu.encryptKey,
    verificationToken: config.feishu.verificationToken,
    loggerLevel: lark.LoggerLevel?.info
  }, createCardActionTriggerHandler({ logger }));

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

  await wsClient.start({
    eventDispatcher: createWsEventDispatcher({
      config,
      feishuClient,
      codexRunner,
      deduper,
      logger,
      lark
    })
  });

  return wsClient;
}
