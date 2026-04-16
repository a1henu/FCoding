import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, parseArgs, parseBoolean, parseList } from '../src/config.js';

test('parses booleans and comma-separated lists', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('0', true), false);
  assert.deepEqual(parseList('ou_1, ou_2,,ou_3'), ['ou_1', 'ou_2', 'ou_3']);
});

test('parses quoted command arguments', () => {
  assert.deepEqual(
    parseArgs('exec --sandbox workspace-write --note "hello world"'),
    ['exec', '--sandbox', 'workspace-write', '--note', 'hello world']
  );
  assert.throws(() => parseArgs('exec "unterminated'));
});

test('loads deployment config from environment values', () => {
  const config = loadConfig({
    PORT: '8080',
    HOST: '127.0.0.1',
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'secret',
    FEISHU_EVENT_MODE: 'ws',
    FEISHU_VERIFICATION_TOKEN: 'verify-token',
    FEISHU_ENCRYPT_KEY: 'encrypt-key',
    ALLOWED_OPEN_IDS: 'ou_1,ou_2',
    BOT_TRIGGER_PREFIX: 'codex',
    CODEX_COMMAND: 'node',
    CODEX_ARGS: '-e "console.log(1)"',
    CODEX_TIMEOUT_MS: '5000'
  });

  assert.equal(config.port, 8080);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.eventMode, 'ws');
  assert.equal(config.verifyFeishuSignature, true);
  assert.equal(config.feishu.appId, 'app-id');
  assert.deepEqual(config.access.allowedOpenIds, ['ou_1', 'ou_2']);
  assert.equal(config.access.triggerPrefix, 'codex');
  assert.deepEqual(config.codex.args, ['-e', 'console.log(1)']);
  assert.equal(config.codex.timeoutMs, 5000);
});
