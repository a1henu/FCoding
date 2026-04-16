import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EventDeduper,
  FeishuAuthError,
  extractCodexTask,
  parseFeishuPayload,
  stripFeishuMentions
} from '../src/feishu/events.js';

test('parses url verification payloads', () => {
  assert.deepEqual(
    parseFeishuPayload(
      { type: 'url_verification', token: 'token', challenge: 'abc' },
      { verificationToken: 'token' }
    ),
    { kind: 'url_verification', challenge: 'abc' }
  );
});

test('rejects invalid verification tokens', () => {
  assert.throws(
    () => parseFeishuPayload({ token: 'bad' }, { verificationToken: 'good' }),
    FeishuAuthError
  );
});

test('extracts Codex prompts from text messages', () => {
  const parsed = parseFeishuPayload({
    header: {
      token: 'token',
      event_id: 'evt-1',
      event_type: 'im.message.receive_v1'
    },
    event: {
      sender: {
        sender_id: {
          open_id: 'ou-1',
          user_id: 'user-1'
        }
      },
      message: {
        message_id: 'msg-1',
        chat_id: 'chat-1',
        message_type: 'text',
        content: JSON.stringify({
          text: '<at user_id="bot"></at> codex fix the failing test'
        })
      }
    }
  }, { verificationToken: 'token' });

  assert.deepEqual(
    extractCodexTask(parsed, {
      allowedOpenIds: ['ou-1'],
      allowedUserIds: [],
      allowedChatIds: ['chat-1'],
      triggerPrefix: 'codex'
    }),
    {
      eventId: 'evt-1',
      messageId: 'msg-1',
      chatId: 'chat-1',
      senderId: {
        open_id: 'ou-1',
        user_id: 'user-1'
      },
      prompt: 'fix the failing test',
      rawText: '<at user_id="bot"></at> codex fix the failing test'
    }
  );
});

test('filters messages outside allow lists', () => {
  const parsed = {
    kind: 'message',
    eventId: 'evt-1',
    sender: { sender_id: { open_id: 'blocked', user_id: 'user-1' } },
    message: {
      message_id: 'msg-1',
      chat_id: 'chat-1',
      message_type: 'text',
      content: JSON.stringify({ text: 'codex help' })
    }
  };

  assert.equal(
    extractCodexTask(parsed, {
      allowedOpenIds: ['allowed'],
      allowedUserIds: [],
      allowedChatIds: [],
      triggerPrefix: 'codex'
    }),
    null
  );
});

test('deduplicates event ids until expiry', () => {
  let now = 1000;
  const deduper = new EventDeduper({ ttlMs: 100, now: () => now });

  assert.equal(deduper.seen('evt-1'), false);
  assert.equal(deduper.seen('evt-1'), true);
  now = 1200;
  assert.equal(deduper.seen('evt-1'), false);
});

test('strips Feishu mention markup', () => {
  assert.equal(
    stripFeishuMentions('<at user_id="bot"></at> codex run tests'),
    'codex run tests'
  );
});
