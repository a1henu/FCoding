import process from 'node:process';

const DEFAULT_CODEX_ARGS = [
  'exec',
  '--skip-git-repo-check',
  '--sandbox',
  'workspace-write',
];

export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function parseInteger(value, defaultValue) {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

export function parseList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArgs(value) {
  if (!value) {
    return [...DEFAULT_CODEX_ARGS];
  }

  const args = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw new Error('Unclosed quote in CODEX_ARGS');
  }

  if (current) {
    args.push(current);
  }

  return args;
}

export function loadConfig(env = process.env) {
  const port = parseInteger(env.PORT, 3000);
  const callbackPath = env.FEISHU_CALLBACK_PATH || '/feishu/events';
  const encryptKey = env.FEISHU_ENCRYPT_KEY || '';
  const eventMode = env.FEISHU_EVENT_MODE || 'http';

  return {
    port,
    host: env.HOST || '0.0.0.0',
    callbackPath,
    eventMode,
    bodyLimitBytes: parseInteger(env.BODY_LIMIT_BYTES, 1024 * 1024),
    verifyFeishuSignature: parseBoolean(
      env.FEISHU_VERIFY_SIGNATURE,
      Boolean(encryptKey)
    ),
    feishu: {
      appId: env.FEISHU_APP_ID || '',
      appSecret: env.FEISHU_APP_SECRET || '',
      verificationToken: env.FEISHU_VERIFICATION_TOKEN || '',
      encryptKey,
      baseUrl: env.FEISHU_BASE_URL || 'https://open.feishu.cn/open-apis',
      sendAck: parseBoolean(env.FEISHU_SEND_ACK, true)
    },
    access: {
      allowedOpenIds: parseList(env.ALLOWED_OPEN_IDS),
      allowedUserIds: parseList(env.ALLOWED_USER_IDS),
      allowedChatIds: parseList(env.ALLOWED_CHAT_IDS),
      triggerPrefix: env.BOT_TRIGGER_PREFIX || ''
    },
    codex: {
      command: env.CODEX_COMMAND || 'codex',
      args: parseArgs(env.CODEX_ARGS),
      cwd: env.CODEX_WORKDIR || process.cwd(),
      timeoutMs: parseInteger(env.CODEX_TIMEOUT_MS, 10 * 60 * 1000),
      maxOutputChars: parseInteger(env.CODEX_MAX_OUTPUT_CHARS, 12000),
      progressIntervalMs: parseInteger(env.CODEX_PROGRESS_INTERVAL_MS, 30 * 1000)
    }
  };
}
