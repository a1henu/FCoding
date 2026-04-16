const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_API_KEY_ENV_VAR = 'OPENAI_API_KEY';
const DEFAULT_CARD_TTL_MS = 24 * 60 * 60 * 1000;
const FCODING_PROVIDER_ID = 'fcoding_api';

function toTomlString(value) {
  return JSON.stringify(String(value));
}

function cloneSnapshot(state, env) {
  const hasInMemoryApiKey = Boolean(state.apiKey);
  const hasEnvApiKey = Boolean(env[state.apiKeyEnvVar]);

  return {
    workspace: state.workspace,
    defaultWorkspace: state.defaultWorkspace,
    model: state.model,
    authMode: state.authMode,
    apiBaseUrl: state.apiBaseUrl,
    apiKeyEnvVar: state.apiKeyEnvVar,
    hasInMemoryApiKey,
    hasEnvApiKey,
    apiKeySource: hasInMemoryApiKey
      ? 'in_memory'
      : hasEnvApiKey
        ? 'environment'
        : 'missing'
  };
}

function readInitialAuthMode(env) {
  const mode = env.FCODING_AUTH_MODE || 'chatgpt';
  if (!['chatgpt', 'api'].includes(mode)) {
    throw new Error(`Unsupported auth mode: ${mode}`);
  }

  return mode;
}

function readInitialApiBaseUrl(env) {
  const baseUrl = env.FCODING_API_BASE_URL || DEFAULT_API_BASE_URL;
  new URL(baseUrl);
  return baseUrl;
}

function readInitialApiKeyEnvVar(env) {
  const envVarName = env.FCODING_API_KEY_ENV_VAR || DEFAULT_API_KEY_ENV_VAR;
  if (!isValidEnvVarName(envVarName)) {
    throw new Error('Invalid environment variable name');
  }

  return envVarName;
}

export function isValidEnvVarName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

export function createRuntimeState({
  config,
  env = process.env,
  now = () => Date.now(),
  cardTtlMs = DEFAULT_CARD_TTL_MS
} = {}) {
  if (!config?.codex) {
    throw new Error('config.codex is required to create runtime state');
  }

  const state = {
    workspace: config.codex.cwd,
    defaultWorkspace: config.codex.cwd,
    model: env.FCODING_MODEL || '',
    authMode: readInitialAuthMode(env),
    apiBaseUrl: readInitialApiBaseUrl(env),
    apiKeyEnvVar: readInitialApiKeyEnvVar(env),
    apiKey: ''
  };
  const cards = new Map();
  let cardCounter = 0;

  function pruneCards() {
    const current = now();
    for (const [cardId, entry] of cards.entries()) {
      if (entry.expiresAt <= current) {
        cards.delete(cardId);
      }
    }
  }

  function snapshot() {
    return cloneSnapshot(state, env);
  }

  function createCardState(type, payload) {
    pruneCards();
    const cardId = `fcoding-card-${now()}-${++cardCounter}`;
    cards.set(cardId, {
      type,
      payload,
      expiresAt: now() + cardTtlMs
    });
    return cardId;
  }

  function getCardState(cardId) {
    pruneCards();
    const entry = cards.get(cardId);
    if (!entry) {
      return null;
    }

    return {
      type: entry.type,
      payload: entry.payload
    };
  }

  function buildApiProviderArgs() {
    return [
      '-c',
      `model_provider=${toTomlString(FCODING_PROVIDER_ID)}`,
      '-c',
      `model_providers.${FCODING_PROVIDER_ID}.name=${toTomlString('FCoding API')}`,
      '-c',
      `model_providers.${FCODING_PROVIDER_ID}.base_url=${toTomlString(state.apiBaseUrl)}`,
      '-c',
      `model_providers.${FCODING_PROVIDER_ID}.env_key=${toTomlString(state.apiKeyEnvVar)}`,
      '-c',
      `model_providers.${FCODING_PROVIDER_ID}.wire_api=${toTomlString('responses')}`
    ];
  }

  return {
    snapshot,
    hasConfiguredApiKey() {
      return snapshot().apiKeySource !== 'missing';
    },
    setWorkspace(workspace) {
      state.workspace = workspace;
      return snapshot();
    },
    resetWorkspace() {
      state.workspace = state.defaultWorkspace;
      return snapshot();
    },
    setModel(model) {
      state.model = model;
      return snapshot();
    },
    clearModel() {
      state.model = '';
      return snapshot();
    },
    setAuthMode(mode) {
      if (!['chatgpt', 'api'].includes(mode)) {
        throw new Error(`Unsupported auth mode: ${mode}`);
      }

      state.authMode = mode;
      return snapshot();
    },
    setApiBaseUrl(baseUrl) {
      state.apiBaseUrl = baseUrl;
      return snapshot();
    },
    resetApiBaseUrl() {
      state.apiBaseUrl = DEFAULT_API_BASE_URL;
      return snapshot();
    },
    setApiKeyEnvVar(envVarName) {
      if (!isValidEnvVarName(envVarName)) {
        throw new Error('Invalid environment variable name');
      }

      state.apiKeyEnvVar = envVarName;
      return snapshot();
    },
    resetApiKeyEnvVar() {
      state.apiKeyEnvVar = DEFAULT_API_KEY_ENV_VAR;
      return snapshot();
    },
    setApiKey(apiKey) {
      state.apiKey = apiKey;
      return snapshot();
    },
    clearApiKey() {
      state.apiKey = '';
      return snapshot();
    },
    createCardState,
    getCardState,
    buildCodexRunOptions(baseCodexConfig) {
      const args = [...baseCodexConfig.args];
      const childEnv = { ...env };

      if (state.model) {
        args.push('-m', state.model);
      }

      if (state.authMode === 'api') {
        args.push(...buildApiProviderArgs());
        if (state.apiKey) {
          childEnv[state.apiKeyEnvVar] = state.apiKey;
        }
      }

      return {
        ...baseCodexConfig,
        cwd: state.workspace,
        args,
        env: childEnv
      };
    }
  };
}

export const runtimeStateDefaults = {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_KEY_ENV_VAR,
  FCODING_PROVIDER_ID
};
