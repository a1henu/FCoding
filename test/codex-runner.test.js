import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCodexResult, runCodexTask, truncateText } from '../src/codex/runner.js';

test('runs a command with the prompt appended as an argument', async () => {
  const result = await runCodexTask({
    prompt: 'fix tests',
    command: process.execPath,
    args: ['-e', 'process.stdout.write(process.argv.at(-1))'],
    timeoutMs: 1000
  });

  assert.equal(result.ok, true);
  assert.equal(result.output, 'fix tests');
});

test('captures failures and stderr', async () => {
  const result = await runCodexTask({
    prompt: 'ignored',
    command: process.execPath,
    args: ['-e', 'console.error("bad"); process.exit(2)'],
    timeoutMs: 1000
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.match(result.output, /bad/);
});

test('times out long running commands', async () => {
  const result = await runCodexTask({
    prompt: 'ignored',
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 1000)'],
    timeoutMs: 20
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.match(result.error, /timed out/);
});

test('cancels a running command through abort signal', async () => {
  const controller = new AbortController();
  const resultPromise = runCodexTask({
    prompt: 'ignored',
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 1000)'],
    timeoutMs: 1000,
    signal: controller.signal
  });

  controller.abort();
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.match(result.error, /cancelled/);
});

test('truncates large output from the middle', () => {
  const truncated = truncateText('a'.repeat(50) + 'b'.repeat(50), 40);
  assert.equal(truncated.length, 40);
  assert.match(truncated, /output truncated/);
});

test('formats successful and failed results for Feishu replies', () => {
  assert.match(formatCodexResult({ ok: true, durationMs: 1000, output: 'done' }), /done/);
  assert.match(
    formatCodexResult({ ok: false, durationMs: 1000, output: 'oops', exitCode: 1 }),
    /failed with exit code 1/
  );
  assert.match(
    formatCodexResult({ ok: false, cancelled: true, durationMs: 1000, output: '' }),
    /cancelled/
  );
});
