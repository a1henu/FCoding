import assert from 'node:assert/strict';
import test from 'node:test';
import { FeishuApiError, FeishuClient, splitText } from '../src/feishu/client.js';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    }
  };
}

test('gets tenant token and replies to a message', async () => {
  const calls = [];
  const client = new FeishuClient({
    appId: 'app-id',
    appSecret: 'secret',
    baseUrl: 'https://feishu.test/open-apis',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
      }
      return jsonResponse({ code: 0, data: { message_id: 'reply-id' } });
    }
  });

  await client.replyText('msg-1', 'hello');

  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.authorization, 'Bearer tenant-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    msg_type: 'text',
    content: JSON.stringify({ text: 'hello' })
  });
});


test('replies with interactive cards', async () => {
  const calls = [];
  const client = new FeishuClient({
    appId: 'app-id',
    appSecret: 'secret',
    baseUrl: 'https://feishu.test/open-apis',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
      }
      return jsonResponse({ code: 0 });
    }
  });

  const card = { elements: [], header: { title: { tag: 'plain_text', content: 'Test' } } };
  await client.replyInteractiveCard('msg-1', card);

  assert.deepEqual(JSON.parse(calls[1].options.body), {
    msg_type: 'interactive',
    content: JSON.stringify(card)
  });
});


test('caches tenant tokens until expiry', async () => {
  let now = 1000;
  let tokenRequests = 0;
  const client = new FeishuClient({
    appId: 'app-id',
    appSecret: 'secret',
    now: () => now,
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        tokenRequests += 1;
        return jsonResponse({ code: 0, tenant_access_token: `token-${tokenRequests}`, expire: 7200 });
      }
      return jsonResponse({ code: 0 });
    }
  });

  await client.replyText('msg-1', 'one');
  await client.replyText('msg-1', 'two');
  now += 8000 * 1000;
  await client.replyText('msg-1', 'three');

  assert.equal(tokenRequests, 2);
});

test('splits long replies', async () => {
  assert.deepEqual(splitText('abcdef', 2), ['ab', 'cd', 'ef']);
});

test('throws on Feishu API errors', async () => {
  const client = new FeishuClient({
    appId: 'app-id',
    appSecret: 'secret',
    fetchImpl: async () => jsonResponse({ code: 999, msg: 'bad' })
  });

  await assert.rejects(() => client.getTenantAccessToken(), FeishuApiError);
});
