import crypto from 'node:crypto';

export function calculateSignature({ timestamp, nonce, encryptKey, body }) {
  return crypto
    .createHash('sha256')
    .update(`${timestamp}${nonce}${encryptKey}${body}`)
    .digest('hex');
}

export function verifySignature({
  timestamp,
  nonce,
  signature,
  encryptKey,
  body
}) {
  if (!timestamp || !nonce || !signature || !encryptKey) {
    return false;
  }

  const expected = calculateSignature({ timestamp, nonce, encryptKey, body });
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export function decryptPayload(encrypt, encryptKey) {
  if (!encryptKey) {
    throw new Error('FEISHU_ENCRYPT_KEY is required for encrypted payloads');
  }

  const key = crypto.createHash('sha256').update(encryptKey).digest();
  const encryptedBytes = Buffer.from(encrypt, 'base64');
  const iv = encryptedBytes.subarray(0, 16);
  const encrypted = encryptedBytes.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');

  return JSON.parse(decrypted);
}
