import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { createRuntimeState } from '../src/runtime-state.js';
import {
  createCardActionTriggerHandler,
  createWsEventDispatcher,
  normalizeWsMessageEvent,
  patchWsClientCardCallbacks,
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
  const cards = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    runtimeState: createRuntimeState({ config: makeConfig() }),
    feishuClient: {
      async replyInteractiveCard(messageId, card) {
        cards.push({ messageId, card });
        if (cards.length === 2) {
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

  assert.equal(cards[0].card.header.title.content, 'FCoding task running');
  assert.equal(cards[1].card.header.title.content, 'FCoding task finished');
});

test('WS dispatcher sends a callback test card for cardtest command', async () => {
  const cards = [];
  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    runtimeState: createRuntimeState({ config: makeConfig() }),
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
  const handler = createCardActionTriggerHandler({
    logger: { info() {} },
    runtimeState: createRuntimeState({ config: makeConfig() })
  });
  const response = await handler({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'callback_test', nonce: 'n-1' } }
  });

  assert.equal(response.header.template, 'green');
  assert.match(response.elements[0].text.content, /callback_test/);
});

test('card action handler expands stored task output cards', async () => {
  const runtimeState = createRuntimeState({ config: makeConfig() });
  const cardId = runtimeState.createCardState('task_result', {
    task: { prompt: 'fix tests' },
    result: { ok: true, output: 'full output', durationMs: 1200 }
  });
  const handler = createCardActionTriggerHandler({
    logger: { info() {} },
    runtimeState
  });

  const response = await handler({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'expand_output', card_id: cardId } }
  });

  assert.equal(response.header.title.content, 'FCoding task finished');
  assert.match(response.elements[0].text.content, /full output/);
});

test('card action handler cancels active tasks', async () => {
  let cancelled = false;
  const runtimeState = createRuntimeState({ config: makeConfig() });
  const taskId = runtimeState.registerActiveTask(
    { eventId: 'evt-cancel', messageId: 'msg-cancel', prompt: 'slow task' },
    () => {
      cancelled = true;
    }
  );
  const handler = createCardActionTriggerHandler({
    logger: { info() {} },
    runtimeState
  });

  const response = await handler({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'cancel_task', task_id: taskId } }
  });

  assert.equal(cancelled, true);
  assert.equal(response.header.title.content, 'FCoding task cancel requested');
});

test('WS dispatcher routes card action callbacks through the official card handler', async () => {
  FakeCardActionHandler.last = null;
  const dispatcher = createWsEventDispatcher({
    config: makeConfig(),
    runtimeState: createRuntimeState({ config: makeConfig() }),
    feishuClient: { replyInteractiveCard: async () => {} },
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
    runtimeState: createRuntimeState({ config: makeConfig() }),
    feishuClient: { replyInteractiveCard: async () => {} },
    logger: { info() {}, error() {} },
    lark: fakeLark
  });

  await dispatcher.invoke({
    operator: { open_id: 'ou-1' },
    action: { value: { fcoding_action: 'callback_test', nonce: 'n-1' } }
  });

  assert.deepEqual(FakeCardActionHandler.last.invocations[0].headers, {});
});

test('patches Feishu WS client to dispatch card callback frames', async () => {
  const invocations = [];
  const sent = [];
  const wsClient = {
    dataCache: {
      mergeData({ data }) {
        return JSON.parse(new TextDecoder().decode(data));
      }
    },
    eventDispatcher: {
      async invoke(data, params) {
        invocations.push({ data, params });
        return { header: { template: 'green' }, elements: [] };
      }
    },
    sendMessage(data) {
      sent.push(data);
    },
    async handleEventData() {
      throw new Error('card frames should not use the original event handler');
    }
  };

  patchWsClientCardCallbacks(wsClient, { logger: { info() {}, error() {} } });

  await wsClient.handleEventData({
    headers: [
      { key: 'type', value: 'card' },
      { key: 'message_id', value: 'card-msg-1' },
      { key: 'sum', value: '1' },
      { key: 'seq', value: '0' },
      { key: 'trace_id', value: 'trace-1' }
    ],
    payload: new TextEncoder().encode(JSON.stringify({
      action: { value: { fcoding_action: 'callback_test' } }
    }))
  });

  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0].params, { needCheck: false });
  assert.equal(invocations[0].data.action.value.fcoding_action, 'callback_test');
  assert.equal(sent.length, 1);

  const response = JSON.parse(new TextDecoder().decode(sent[0].payload));
  assert.equal(response.code, 200);
  assert.equal(
    JSON.parse(Buffer.from(response.data, 'base64').toString()).header.template,
    'green'
  );
});

test('patched Feishu WS client keeps normal event frames on the SDK handler', async () => {
  let originalCalled = false;
  const wsClient = {
    async handleEventData(data) {
      originalCalled = data.headers[0].value === 'event';
    }
  };

  patchWsClientCardCallbacks(wsClient, { logger: { info() {}, error() {} } });

  await wsClient.handleEventData({
    headers: [{ key: 'type', value: 'event' }],
    payload: new TextEncoder().encode('{}')
  });

  assert.equal(originalCalled, true);
});

test('starts the official Feishu WS client with an event dispatcher', async () => {
  FakeWsClient.instances = [];
  const wsClient = await startWsEventClient({
    config: makeConfig(),
    runtimeState: createRuntimeState({ config: makeConfig() }),
    feishuClient: { replyInteractiveCard: async () => {} },
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
