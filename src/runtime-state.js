const DEFAULT_CARD_TTL_MS = 24 * 60 * 60 * 1000;

function cloneSnapshot(state) {
  return {
    workspace: state.workspace,
    defaultWorkspace: state.defaultWorkspace,
    model: state.model,
    authMode: 'chatgpt'
  };
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
    model: env.FCODING_MODEL || ''
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
    return cloneSnapshot(state);
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

  return {
    snapshot,
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
    createCardState,
    getCardState,
    buildCodexRunOptions(baseCodexConfig) {
      const args = [...baseCodexConfig.args];
      const childEnv = { ...env };

      if (state.model) {
        args.push('-m', state.model);
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
