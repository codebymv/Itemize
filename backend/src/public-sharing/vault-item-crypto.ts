import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const encryptionKey = (): Buffer => {
  const keyHex = process.env.VAULT_ENCRYPTION_KEY;
  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'VAULT_ENCRYPTION_KEY environment variable is required in production',
      );
    }
    const jwtSecret = process.env.JWT_SECRET || 'development-secret';
    return crypto.createHash('sha256').update(jwtSecret).digest();
  }
  if (keyHex.length !== 64) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)',
    );
  }
  return Buffer.from(keyHex, 'hex');
};

export const encryptVaultItemValue = (
  plaintext: string,
): { encrypted: string; iv: string } => {
  const key = encryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
};

export const decryptVaultItemValue = (
  encryptedBase64: string,
  ivBase64: string,
): string => {
  try {
    const key = encryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
    const authTag = encryptedBuffer.subarray(-AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(0, -AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'Failed to decrypt data - data may be corrupted or tampered with',
    );
  }
};
