import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadDotEnv, parseDotEnv } from '../src/dotenv.js';

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
