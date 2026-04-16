import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import {
  createWsEventDispatcher,
  normalizeWsMessageEvent,
  startWsEventClient
} from '../src/feishu/ws.js';

class FakeEventDispatcher {
  static last = null;

  constructor() {
    this.handlers = {};
    FakeEventDispatcher.last = this;
  }

  register(handlers) {
    this.handlers = handlers;
    return this;
  }
}

class FakeWsClient {
  static instances = [];

  constructor(params) {
    this.params = params;
    this.startedWith = null;
    FakeWsClient.instances.push(this);
  }

  async start(params) {
    this.startedWith = params;
  }

  close(params) {
    this.closedWith = params;
  }
}

const fakeLark = {
  EventDispatcher: FakeEventDispatcher,
  WSClient: FakeWsClient,
  LoggerLevel: { info: 3 }
};

function makeConfig() {
  return loadConfig({
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'secret',
    FEISHU_EVENT_MODE: 'ws',
    FEISHU_SEND_ACK: 'true',
    BOT_TRIGGER_PREFIX: 'codex',
    CODEX_COMMAND: process.execPath,
    CODEX_ARGS: '-e "process.stdout.write(process.argv.at(-1))"'
  });
}

function wsPayload(overrides = {}) {
  return {
    event_id: 'evt-1',
    sender: {
      sender_id: { open_id: 'ou-1', user_id: 'user-1' }
    },
    message: {
      message_id: 'msg-1',
      chat_id: 'chat-1',
      message_type: 'text',
      content: JSON.stringify({ text: 'codex run tests' })
    },
    ...overrides
  };
}

test('normalizes Feishu WS message events for existing task extraction', () => {
  assert.deepEqual(normalizeWsMessageEvent(wsPayload()), {
    kind: 'message',
    eventId: 'evt-1',
    eventType: 'im.message.receive_v1',
    sender: {
      sender_id: { open_id: 'ou-1', user_id: 'user-1' }
    },
    message: {
      message_id: 'msg-1',
      chat_id: 'chat-1',
      message_type: 'text',
      content: JSON.stringify({ text: 'codex run tests' })
    }
  });
});

test('WS dispatcher schedules Codex work and returns quickly', async () => {
  const replies = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    feishuClient: {
      async replyText(messageId, text) {
        replies.push({ messageId, text });
        if (replies.length === 2) {
          resolveDone();
        }
      }
    },
    codexRunner: async ({ prompt }) => ({ ok: true, output: `ran: ${prompt}`, durationMs: 10 }),
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  await dispatcher.handlers['im.message.receive_v1'](wsPayload());
  await done;

  assert.equal(replies[0].text, 'Received. Codex is working on it.');
  assert.match(replies[1].text, /ran: run tests/);
});

test('starts the official Feishu WS client with an event dispatcher', async () => {
  FakeWsClient.instances = [];
  const wsClient = await startWsEventClient({
    config: makeConfig(),
    feishuClient: { replyText: async () => {} },
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  assert.equal(wsClient, FakeWsClient.instances[0]);
  assert.equal(wsClient.params.appId, 'app-id');
  assert.equal(wsClient.params.appSecret, 'secret');
  assert.ok(wsClient.startedWith.eventDispatcher instanceof FakeEventDispatcher);
});
