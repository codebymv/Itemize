import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const AUTH_TAG_LENGTH = 16;

const encryptionKey = (): Buffer => {
  const configured = process.env.VAULT_ENCRYPTION_KEY;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('VAULT_ENCRYPTION_KEY is required in production');
    }
    return createHash('sha256')
      .update(process.env.JWT_SECRET ?? 'development-secret')
      .digest();
  }
  if (!/^[a-fA-F0-9]{64}$/.test(configured)) {
    throw new Error('VAULT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  return Buffer.from(configured, 'hex');
};

export const decryptVaultValue = (
  encryptedBase64: string,
  ivBase64: string,
): string => {
  const combined = Buffer.from(encryptedBase64, 'base64');
  if (combined.length < AUTH_TAG_LENGTH) {
    throw new Error('Encrypted vault value is invalid');
  }
  const encrypted = combined.subarray(0, -AUTH_TAG_LENGTH);
  const authTag = combined.subarray(-AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivBase64, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
};

export const encryptVaultValue = (
  plaintext: string,
): { encrypted: string; iv: string } => {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, {
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

export const generateVaultSalt = (): string =>
  randomBytes(16).toString('base64');
