import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeState } from '../src/runtime-state.js';
import { loadConfig } from '../src/config.js';

function makeConfig() {
  return loadConfig({
    CODEX_COMMAND: 'codex',
    CODEX_ARGS: 'exec --skip-git-repo-check --sandbox workspace-write',
    CODEX_WORKDIR: '/repo'
  });
}

test('builds runtime codex options for ChatGPT auth', () => {
  const runtime = createRuntimeState({ config: makeConfig(), env: {} });
  runtime.setWorkspace('/repo/subdir');
  runtime.setModel('gpt-5.2');

  const options = runtime.buildCodexRunOptions(makeConfig().codex);
  assert.equal(options.cwd, '/repo/subdir');
  assert.deepEqual(options.args.slice(-2), ['-m', 'gpt-5.2']);
});

test('initializes runtime model override from environment', () => {
  const runtime = createRuntimeState({
    config: makeConfig(),
    env: {
      FCODING_MODEL: 'gpt-5.4-xhigh'
    }
  });
  const snapshot = runtime.snapshot();

  assert.equal(snapshot.authMode, 'chatgpt');
  assert.equal(snapshot.model, 'gpt-5.4-xhigh');
});

test('stores card state for later expansion', () => {
  const runtime = createRuntimeState({ config: makeConfig(), env: {} });
  const cardId = runtime.createCardState('task_result', { task: { prompt: 'hi' } });

  assert.deepEqual(runtime.getCardState(cardId), {
    type: 'task_result',
    payload: { task: { prompt: 'hi' } }
  });
});

test('tracks and cancels active tasks', () => {
  let cancelled = false;
  const runtime = createRuntimeState({ config: makeConfig(), env: {} });
  const taskId = runtime.registerActiveTask(
    { eventId: 'evt-1', messageId: 'msg-1', prompt: 'slow task' },
    () => {
      cancelled = true;
    }
  );

  assert.equal(runtime.snapshot().activeTaskCount, 1);
  assert.equal(runtime.snapshot().activeTask.prompt, 'slow task');

  const task = runtime.cancelActiveTask(taskId);
  assert.equal(task.prompt, 'slow task');
  assert.equal(cancelled, true);

  runtime.finishActiveTask(taskId);
  assert.equal(runtime.snapshot().activeTaskCount, 0);
});
