import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadDotEnv, loadDotEnvFiles, parseDotEnv } from '../src/dotenv.js';

test('parses dotenv files with comments and quotes', () => {
  assert.deepEqual(parseDotEnv(`
# ignored
export FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET="secret value"
CODEX_WORKDIR=/tmp/work # inline comment
INVALID-KEY=skip
EMPTY=
`), {
    FEISHU_APP_ID: 'cli_xxx',
    FEISHU_APP_SECRET: 'secret value',
    CODEX_WORKDIR: '/tmp/work',
    EMPTY: ''
  });
});

test('loads dotenv values without overwriting existing env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcoding-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'A=from-file\nB=from-file\n', 'utf8');
  const env = { A: 'existing' };

  assert.deepEqual(loadDotEnv(file, env), { A: 'from-file', B: 'from-file' });
  assert.deepEqual(env, { A: 'existing', B: 'from-file' });
});

test('loads multiple dotenv files in order without overwriting existing values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcoding-env-files-'));
  const first = path.join(dir, '.env');
  const second = path.join(dir, '.env.api');
  fs.writeFileSync(first, 'A=from-first\nB=from-first\n', 'utf8');
  fs.writeFileSync(second, 'B=from-second\nC=from-second\n', 'utf8');
  const env = {};

  assert.deepEqual(loadDotEnvFiles([first, second], env), {
    [first]: { A: 'from-first', B: 'from-first' },
    [second]: { B: 'from-second', C: 'from-second' }
  });
  assert.deepEqual(env, { A: 'from-first', B: 'from-first', C: 'from-second' });
});
