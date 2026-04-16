export class FeishuAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeishuAuthError';
  }
}

export function verifyPayloadToken(payload, verificationToken) {
  if (!verificationToken) {
    return;
  }

  const token = payload?.token || payload?.header?.token;
  if (token !== verificationToken) {
    throw new FeishuAuthError('Invalid Feishu verification token');
  }
}

export function parseFeishuPayload(payload, options = {}) {
  verifyPayloadToken(payload, options.verificationToken);

  if (payload?.type === 'url_verification') {
    return {
      kind: 'url_verification',
      challenge: payload.challenge
    };
  }

  const eventType = payload?.header?.event_type || payload?.event?.type;
  const eventId = payload?.header?.event_id || payload?.uuid || '';

  if (!eventType) {
    return { kind: 'unsupported', eventId, reason: 'missing_event_type' };
  }

  if (eventType !== 'im.message.receive_v1') {
    return { kind: 'unsupported', eventId, eventType };
  }

  const message = payload.event?.message;
  if (!message) {
    return { kind: 'unsupported', eventId, eventType, reason: 'missing_message' };
  }

  return {
    kind: 'message',
    eventId,
    eventType,
    sender: payload.event?.sender || {},
    message
  };
}

export function parseMessageContent(content) {
  if (!content) {
    return {};
  }

  if (typeof content === 'object') {
    return content;
  }

  try {
    return JSON.parse(content);
  } catch {
    return { text: String(content) };
  }
}

export function stripFeishuMentions(text) {
  return String(text || '')
    .replace(/<at\s+[^>]*><\/at>/g, ' ')
    .replace(/<at\s+[^>]*>.*?<\/at>/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllowed(value, allowedValues) {
  return allowedValues.length === 0 || allowedValues.includes(value);
}

export function extractCodexTask(parsedEvent, access = {}) {
  if (parsedEvent.kind !== 'message') {
    return null;
  }

  const message = parsedEvent.message;
  if (message.message_type !== 'text') {
    return null;
  }

  const senderId = parsedEvent.sender?.sender_id || {};
  const chatId = message.chat_id || '';

  if (!isAllowed(chatId, access.allowedChatIds || [])) {
    return null;
  }

  if (!isAllowed(senderId.open_id || '', access.allowedOpenIds || [])) {
    return null;
  }

  if (!isAllowed(senderId.user_id || '', access.allowedUserIds || [])) {
    return null;
  }

  const content = parseMessageContent(message.content);
  let prompt = stripFeishuMentions(content.text || '');
  const triggerPrefix = access.triggerPrefix || '';

  if (triggerPrefix) {
    if (!prompt.startsWith(triggerPrefix)) {
      return null;
    }

    prompt = prompt.slice(triggerPrefix.length).trim();
  }

  if (!prompt) {
    return null;
  }

  return {
    eventId: parsedEvent.eventId,
    messageId: message.message_id,
    chatId,
    senderId,
    prompt,
    rawText: content.text || ''
  };
}

export class EventDeduper {
  constructor({ ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.events = new Map();
  }

  seen(eventId) {
    if (!eventId) {
      return false;
    }

    this.prune();
    if (this.events.has(eventId)) {
      return true;
    }

    this.events.set(eventId, this.now() + this.ttlMs);
    return false;
  }

  prune() {
    const now = this.now();
    for (const [eventId, expiresAt] of this.events.entries()) {
      if (expiresAt <= now) {
        this.events.delete(eventId);
      }
    }
  }
}
