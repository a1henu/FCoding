import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  calculateSignature,
  decryptPayload,
  verifySignature
} from '../src/feishu/crypto.js';

function encryptForTest(payload, encryptKey, iv = Buffer.alloc(16, 1)) {
  const key = crypto.createHash('sha256').update(encryptKey).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ]);

  return Buffer.concat([iv, encrypted]).toString('base64');
}

test('calculates and verifies Feishu request signatures', () => {
  const input = {
    timestamp: '1710000000',
    nonce: 'nonce-1',
    encryptKey: 'encrypt-key',
    body: '{"hello":"world"}'
  };
  const signature = calculateSignature(input);

  assert.equal(
    verifySignature({ ...input, signature }),
    true
  );
  assert.equal(
    verifySignature({ ...input, body: '{"changed":true}', signature }),
    false
  );
});

test('decrypts encrypted Feishu payloads', () => {
  const encryptKey = 'test-encrypt-key';
  const payload = {
    type: 'url_verification',
    challenge: 'challenge-code',
    token: 'verify-token'
  };
  const encrypted = encryptForTest(payload, encryptKey);

  assert.deepEqual(decryptPayload(encrypted, encryptKey), payload);
});
