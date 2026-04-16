export class FeishuApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'FeishuApiError';
    this.details = details;
  }
}

export function splitText(text, maxChars = 3900) {
  const value = String(text || '');
  if (value.length <= maxChars) {
    return [value];
  }

  const parts = [];
  for (let index = 0; index < value.length; index += maxChars) {
    parts.push(value.slice(index, index + maxChars));
  }
  return parts;
}

export class FeishuClient {
  constructor({
    appId,
    appSecret,
    baseUrl = 'https://open.feishu.cn/open-apis',
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    maxReplyChars = 3900
  }) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxReplyChars = maxReplyChars;
    this.cachedTenantToken = null;
  }

  async getTenantAccessToken() {
    if (this.cachedTenantToken && this.cachedTenantToken.expiresAt > this.now()) {
      return this.cachedTenantToken.token;
    }

    if (!this.appId || !this.appSecret) {
      throw new FeishuApiError('FEISHU_APP_ID and FEISHU_APP_SECRET are required');
    }

    const data = await this.requestJson('/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      body: {
        app_id: this.appId,
        app_secret: this.appSecret
      }
    });

    const token = data.tenant_access_token;
    if (!token) {
      throw new FeishuApiError('Feishu token response did not include tenant_access_token', data);
    }

    const expiresInSeconds = Number(data.expire || 7200);
    this.cachedTenantToken = {
      token,
      expiresAt: this.now() + Math.max(0, expiresInSeconds - 120) * 1000
    };

    return token;
  }

  async replyInteractiveCard(messageId, card) {
    const token = await this.getTenantAccessToken();
    return this.requestJson(`/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
      method: 'POST',
      token,
      body: {
        msg_type: 'interactive',
        content: JSON.stringify(card)
      }
    });
  }

  async replyText(messageId, text) {
    const token = await this.getTenantAccessToken();
    const chunks = splitText(text, this.maxReplyChars);
    const results = [];

    for (const [index, chunk] of chunks.entries()) {
      const content = chunks.length > 1
        ? `[${index + 1}/${chunks.length}]\n${chunk}`
        : chunk;
      results.push(await this.requestJson(`/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
        method: 'POST',
        token,
        body: {
          msg_type: 'text',
          content: JSON.stringify({ text: content })
        }
      }));
    }

    return results;
  }

  async requestJson(path, { method = 'GET', body, token } = {}) {
    if (!this.fetchImpl) {
      throw new FeishuApiError('fetch is not available in this runtime');
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new FeishuApiError(`Feishu HTTP ${response.status}`, data);
    }

    if (data.code !== 0) {
      throw new FeishuApiError(data.msg || `Feishu API code ${data.code}`, data);
    }

    return data;
  }
}
