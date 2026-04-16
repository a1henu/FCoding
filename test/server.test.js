import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { calculateSignature } from '../src/feishu/crypto.js';
import { loadConfig } from '../src/config.js';
import { createRuntimeState } from '../src/runtime-state.js';
import { createServer, formatElapsed, processCodexTask } from '../src/server.js';

function makeConfig(overrides = {}) {
  const config = loadConfig({
    PORT: '0',
    FEISHU_VERIFICATION_TOKEN: 'verify-token',
    FEISHU_VERIFY_SIGNATURE: 'false',
    FEISHU_SEND_ACK: 'true',
    BOT_TRIGGER_PREFIX: 'codex',
    CODEX_COMMAND: process.execPath,
    CODEX_ARGS: '-e "process.stdout.write(process.argv.at(-1))"'
  });
  return {
    ...config,
    ...overrides,
    feishu: { ...config.feishu, ...(overrides.feishu || {}) },
    access: { ...config.access, ...(overrides.access || {}) },
    codex: { ...config.codex, ...(overrides.codex || {}) }
  };
}

async function withListeningServer(server, fn) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function textMessagePayload({ eventId = 'evt-1', text = 'codex run tests' } = {}) {
  return {
    header: {
      token: 'verify-token',
      event_id: eventId,
      event_type: 'im.message.receive_v1'
    },
    event: {
      sender: {
        sender_id: { open_id: 'ou-1', user_id: 'user-1' }
      },
      message: {
        message_id: 'msg-1',
        chat_id: 'chat-1',
        message_type: 'text',
        content: JSON.stringify({ text })
      }
    }
  };
}

test('formats elapsed time for progress replies', () => {
  assert.equal(formatElapsed(999), '0s');
  assert.equal(formatElapsed(61_000), '1m 1s');
});

test('sends periodic Codex progress replies while a task is running', async () => {
  const cards = [];
  const config = makeConfig({ codex: { progressIntervalMs: 5 } });
  const runtimeState = createRuntimeState({ config });

  await processCodexTask({
    task: {
      eventId: 'evt-progress',
      messageId: 'msg-progress',
      prompt: 'slow task'
    },
    config,
    runtimeState,
    feishuClient: {
      async replyInteractiveCard(messageId, card) {
        cards.push({ messageId, card });
      }
    },
    codexRunner: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true, output: 'done', durationMs: 25 };
    },
    logger: { error() {} }
  });

  assert.equal(cards[0].card.header.title.content, 'FCoding task accepted');
  assert.ok(cards.some((entry) => entry.card.header.title.content === 'FCoding task running'));
  assert.equal(cards.at(-1).card.header.title.content, 'FCoding task finished');
});

test('handles built-in command prompts before running codex', async () => {
  const cards = [];
  const config = makeConfig();
  const runtimeState = createRuntimeState({ config });

  await processCodexTask({
    task: {
      eventId: 'evt-status',
      messageId: 'msg-status',
      prompt: 'status'
    },
    config,
    runtimeState,
    feishuClient: {
      async replyInteractiveCard(messageId, card) {
        cards.push({ messageId, card });
      }
    },
    codexRunner: async () => {
      throw new Error('codex runner should not be called for status');
    },
    logger: { error() {} }
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].card.header.title.content, 'FCoding status');
});

test('answers Feishu url verification challenges', async () => {
  const server = createServer({
    config: makeConfig(),
    feishuClient: { replyInteractiveCard: async () => {} },
    codexRunner: async () => ({ ok: true, output: 'unused', durationMs: 1 }),
    logger: { error() {} }
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/feishu/events`, {
      method: 'POST',
      body: JSON.stringify({ type: 'url_verification', token: 'verify-token', challenge: 'abc' })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { challenge: 'abc' });
  });
});

test('accepts a message and processes it asynchronously', async () => {
  const cards = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const server = createServer({
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
    logger: { error() {} }
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/feishu/events`, {
      method: 'POST',
      body: JSON.stringify(textMessagePayload())
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, accepted: true });
    await done;
    assert.equal(cards[0].card.header.title.content, 'FCoding task accepted');
    assert.equal(cards[1].card.header.title.content, 'FCoding task finished');
  });
});

test('deduplicates repeated events', async () => {
  const server = createServer({
    config: makeConfig({ feishu: { sendAck: false } }),
    feishuClient: { replyInteractiveCard: async () => {} },
    codexRunner: async () => ({ ok: true, output: 'ok', durationMs: 1 }),
    logger: { error() {} }
  });

  await withListeningServer(server, async (baseUrl) => {
    const body = JSON.stringify(textMessagePayload({ eventId: 'evt-dup' }));
    await fetch(`${baseUrl}/feishu/events`, { method: 'POST', body });
    const response = await fetch(`${baseUrl}/feishu/events`, { method: 'POST', body });

    assert.deepEqual(await response.json(), { ok: true, duplicate: true });
  });
});

test('rejects bad Feishu signatures when enabled', async () => {
  const config = makeConfig({
    verifyFeishuSignature: true,
    feishu: { encryptKey: 'encrypt-key' }
  });
  const server = createServer({
    config,
    feishuClient: { replyInteractiveCard: async () => {} },
    codexRunner: async () => ({ ok: true, output: 'unused', durationMs: 1 }),
    logger: { error() {} }
  });

  await withListeningServer(server, async (baseUrl) => {
    const body = JSON.stringify(textMessagePayload());
    const response = await fetch(`${baseUrl}/feishu/events`, {
      method: 'POST',
      headers: {
        'x-lark-request-timestamp': '1710000000',
        'x-lark-request-nonce': 'nonce',
        'x-lark-signature': calculateSignature({
          timestamp: '1710000000',
          nonce: 'nonce',
          encryptKey: 'wrong-key',
          body
        })
      },
      body
    });

    assert.equal(response.status, 401);
  });
});
