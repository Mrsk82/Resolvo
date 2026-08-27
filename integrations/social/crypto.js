// Encryption-at-rest for social platform credentials.
// No encryption mechanism existed anywhere in this codebase before this
// feature (Twilio/Stripe/Gmail tokens are all stored as plain JSON today) —
// this is a net-new utility, built because Section 7 requires it and nothing
// pre-existing could be reused.
//
// AES-256-GCM via Node's built-in `crypto` — no new npm dependency.
// Key comes from SOCIAL_CREDENTIALS_KEY (32 bytes, base64) in .env.
// Never log the key or plaintext; ciphertext is safe to store in the kv table.

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function _getKey() {
  const b64 = process.env.SOCIAL_CREDENTIALS_KEY;
  if (!b64) {
    throw new Error(
      'SOCIAL_CREDENTIALS_KEY is not set. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))" ' +
      'and add it to .env — required before any social account can be connected.'
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('SOCIAL_CREDENTIALS_KEY must decode to exactly 32 bytes.');
  return key;
}

// Returns a single opaque string safe to store in a JSON blob: iv:authTag:ciphertext (all base64).
function encryptSecret(plaintext) {
  if (plaintext == null) return null;
  const key = _getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decryptSecret(stored) {
  if (!stored) return null;
  const key = _getKey();
  const [ivB64, tagB64, ctB64] = String(stored).split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted secret.');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

// For logs/audit trail — never write a real token to a log line, ever.
function maskSecret(stored) {
  if (!stored) return '(none)';
  return 'enc:' + String(stored).slice(0, 8) + '…';
}

module.exports = { encryptSecret, decryptSecret, maskSecret };
