import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeState, isValidEnvVarName } from '../src/runtime-state.js';
import { loadConfig } from '../src/config.js';

function makeConfig() {
  return loadConfig({
    CODEX_COMMAND: 'codex',
    CODEX_ARGS: 'exec --skip-git-repo-check --sandbox workspace-write',
    CODEX_WORKDIR: '/repo'
  });
}

test('validates environment variable names', () => {
  assert.equal(isValidEnvVarName('OPENAI_API_KEY'), true);
  assert.equal(isValidEnvVarName('1BAD'), false);
});

test('builds runtime codex options for chatgpt auth', () => {
  const runtime = createRuntimeState({ config: makeConfig(), env: {} });
  runtime.setWorkspace('/repo/subdir');
  runtime.setModel('gpt-5.2');

  const options = runtime.buildCodexRunOptions(makeConfig().codex);
  assert.equal(options.cwd, '/repo/subdir');
  assert.deepEqual(options.args.slice(-2), ['-m', 'gpt-5.2']);
});

test('builds runtime codex options for api auth', () => {
  const runtime = createRuntimeState({
    config: makeConfig(),
    env: { CUSTOM_KEY: 'env-key' }
  });
  runtime.setAuthMode('api');
  runtime.setApiBaseUrl('https://example.test/v1');
  runtime.setApiKeyEnvVar('CUSTOM_KEY');

  const options = runtime.buildCodexRunOptions(makeConfig().codex);
  assert.match(options.args.join(' '), /model_provider/);
  assert.match(options.args.join(' '), /https:\/\/example\.test\/v1/);
  assert.equal(options.env.CUSTOM_KEY, 'env-key');
});

test('initializes runtime api mode from environment', () => {
  const runtime = createRuntimeState({
    config: makeConfig(),
    env: {
      FCODING_AUTH_MODE: 'api',
      FCODING_MODEL: 'gpt-5.4-xhigh',
      FCODING_API_BASE_URL: 'https://yunwu.ai/v1',
      FCODING_API_KEY_ENV_VAR: 'CUSTOM_KEY',
      CUSTOM_KEY: 'env-key'
    }
  });
  const snapshot = runtime.snapshot();

  assert.equal(snapshot.authMode, 'api');
  assert.equal(snapshot.model, 'gpt-5.4-xhigh');
  assert.equal(snapshot.apiBaseUrl, 'https://yunwu.ai/v1');
  assert.equal(snapshot.apiKeyEnvVar, 'CUSTOM_KEY');
  assert.equal(snapshot.apiKeySource, 'environment');
});

test('rejects invalid runtime api defaults', () => {
  assert.throws(() => createRuntimeState({
    config: makeConfig(),
    env: { FCODING_AUTH_MODE: 'invalid' }
  }), /Unsupported auth mode/);

  assert.throws(() => createRuntimeState({
    config: makeConfig(),
    env: { FCODING_API_KEY_ENV_VAR: '1BAD' }
  }), /Invalid environment variable/);
});

test('stores card state for later expansion', () => {
  const runtime = createRuntimeState({ config: makeConfig(), env: {} });
  const cardId = runtime.createCardState('task_result', { task: { prompt: 'hi' } });

  assert.deepEqual(runtime.getCardState(cardId), {
    type: 'task_result',
    payload: { task: { prompt: 'hi' } }
  });
});
