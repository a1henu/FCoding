import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import {
  createCardActionTriggerHandler,
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

  async invoke(data) {
    const type = data?.header?.event_type || data?.event?.type || data?.event_type || data?.type;
    const parsed = data?.schema
      ? { ...data.header, ...data.event }
      : data?.event
        ? { ...data.event }
        : data;

    return this.handlers[type](parsed);
  }
}

class FakeCardActionHandler {
  static last = null;

  constructor(params, handler) {
    this.params = params;
    this.handler = handler;
    this.invocations = [];
    FakeCardActionHandler.last = this;
  }

  async invoke(data) {
    this.invocations.push(data);
    const parsed = data?.schema
      ? { ...data.header, ...data.event }
      : data;

    return this.handler(parsed);
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
  CardActionHandler: FakeCardActionHandler,
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

function wsEnvelope(event = wsPayload(), eventType = 'im.message.receive_v1') {
  return {
    schema: '2.0',
    header: {
      event_id: event.event_id,
      event_type: eventType
    },
    event
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

  await dispatcher.invoke(wsEnvelope());
  await done;

  assert.equal(replies[0].text, 'Received. Codex is working on it.');
  assert.match(replies[1].text, /ran: run tests/);
});


test('WS dispatcher sends a callback test card for cardtest command', async () => {
  const cards = [];
  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    feishuClient: {
      async replyInteractiveCard(messageId, card) {
        cards.push({ messageId, card });
      }
    },
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  await dispatcher.invoke(wsEnvelope(wsPayload({
    message: {
      message_id: 'msg-card',
      chat_id: 'chat-1',
      message_type: 'text',
      content: JSON.stringify({ text: 'codex cardtest' })
    }
  })));

  assert.equal(cards.length, 1);
  assert.equal(cards[0].messageId, 'msg-card');
  assert.equal(cards[0].card.elements[1].actions[0].value.fcoding_action, 'callback_test');
});

test('card action handler returns an updated card for callback test cards', async () => {
  const handler = createCardActionTriggerHandler({ logger: { info() {} } });
  const response = await handler({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'callback_test', nonce: 'n-1' } }
  });

  assert.equal(response.header.template, 'green');
  assert.match(response.elements[0].text.content, /callback_test/);
});

test('WS dispatcher routes card action callbacks through the official card handler', async () => {
  FakeCardActionHandler.last = null;
  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    feishuClient: { replyText: async () => {} },
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  const response = await dispatcher.invoke({
    schema: '2.0',
    header: {
      event_type: 'card.action.trigger'
    },
    event: {
      operator: { open_id: 'ou-1' },
      action: { value: { fcoding_action: 'callback_test', nonce: 'n-1' } }
    }
  });

  assert.equal(FakeCardActionHandler.last.invocations.length, 1);
  assert.equal(response.header.template, 'green');
});

test('WS dispatcher adds empty headers for legacy card callback payloads', async () => {
  FakeCardActionHandler.last = null;
  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    feishuClient: { replyText: async () => {} },
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  await dispatcher.invoke({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'callback_test', nonce: 'n-1' } }
  });

  assert.deepEqual(FakeCardActionHandler.last.invocations[0].headers, {});
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
  assert.equal(typeof wsClient.startedWith.eventDispatcher.invoke, 'function');
  assert.ok(FakeEventDispatcher.last instanceof FakeEventDispatcher);
  assert.ok(FakeCardActionHandler.last instanceof FakeCardActionHandler);
});
