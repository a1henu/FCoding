import * as Lark from '@larksuiteoapi/node-sdk';
import { EventDeduper, extractCodexTask } from './events.js';
import { processCodexTask } from '../server.js';
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

      setImmediate(() => {
        processCodexTask({ task, config, feishuClient, codexRunner, logger });
      });
    }
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
