// ============================================
// Cryptography Utilities
// Token generation, hashing, and verification
// ============================================

const crypto = require('crypto');

/**
 * Generate a cryptographically secure random token
 * @param {number} bytes - Number of bytes (default 32 = 64 hex chars)
 * @returns {string} Hex-encoded random token
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token using SHA-256
 * Used for storing verification/reset tokens securely
 * @param {string} token - The token to hash
 * @returns {string} SHA-256 hash of the token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a token against its stored hash
 * Uses timing-safe comparison to prevent timing attacks
 * @param {string} token - The provided token
 * @param {string} storedHash - The stored hash to compare against
 * @returns {boolean} Whether the token matches
 */
function verifyToken(token, storedHash) {
  const tokenHash = hashToken(token);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    // If buffer lengths don't match, comparison fails
    return false;
  }
}

/**
 * Generate a verification token with its hash
 * @returns {{ token: string, hash: string }} Token and its hash
 */
function generateVerificationToken() {
  const token = generateToken(32);
  const hash = hashToken(token);
  return { token, hash };
}

/**
 * Generate an API key in the format: sk_live_[32 hex chars]
 * @returns {string} The generated API key
 */
function generateApiKey() {
  const randomPart = crypto.randomBytes(16).toString('hex'); // 32 chars
  return `sk_live_${randomPart}`;
}

/**
 * Get the prefix of an API key (first 12 characters)
 * Used for looking up API keys without exposing the full key
 * @param {string} key - The full API key
 * @returns {string} The key prefix
 */
function getApiKeyPrefix(key) {
  return key.substring(0, 12);
}

/**
 * Hash an API key using SHA-256
 * @param {string} key - The API key to hash
 * @returns {string} SHA-256 hash of the key
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Verify an API key against its stored hash
 * @param {string} key - The provided API key
 * @param {string} storedHash - The stored hash
 * @returns {boolean} Whether the key matches
 */
function verifyApiKey(key, storedHash) {
  const keyHash = hashApiKey(key);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(keyHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

module.exports = {
  generateToken,
  hashToken,
  verifyToken,
  generateVerificationToken,
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
  verifyApiKey,
};
