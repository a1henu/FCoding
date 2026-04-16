import * as Lark from '@larksuiteoapi/node-sdk';
import { EventDeduper, extractCodexTask } from './events.js';
import { processCodexTask } from '../server.js';
import { buildCallbackTestCard } from './cards.js';
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
      return {
        toast: {
          type: 'success',
          content: 'FCoding received this card callback through long connection.',
          i18n: {
            zh_cn: 'FCoding 已通过长连接收到卡片回调。',
            en_us: 'FCoding received this card callback through long connection.'
          }
        }
      };
    }

    return {
      toast: {
        type: 'info',
        content: 'FCoding received this card callback.'
      }
    };
  };
}

function isCallbackTestPrompt(prompt) {
  return /^(cardtest|callbacktest|test-card|测试卡片回调)$/i.test(prompt.trim());
}

export function createWsEventDispatcher({
  config,
  feishuClient,
  codexRunner = runCodexTask,
  deduper = new EventDeduper(),
  logger = console,
  lark = Lark
}) {
  return new lark.EventDispatcher({}).register({
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
    },
    'card.action.trigger': createCardActionTriggerHandler({ logger })
  });
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
