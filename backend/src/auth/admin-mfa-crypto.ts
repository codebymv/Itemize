import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { parseCalendarTokenKeyring } from '../calendar-oauth/calendar-token-encryption';

function keys() {
  // Same validated envelope/keyring convention, independent MFA key material.
  return parseCalendarTokenKeyring(
    {
      NODE_ENV: 'production',
      CALENDAR_TOKEN_ENCRYPTION_KEYS: process.env.ADMIN_MFA_ENCRYPTION_KEYS,
      CALENDAR_TOKEN_ACTIVE_KEY_ID: process.env.ADMIN_MFA_ACTIVE_KEY_ID,
    },
    { allowDevelopmentFallback: false },
  );
}

export function encryptMfa(secret: string, userId: number): string {
  const ring = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    ring.keys.get(ring.activeKeyId)!,
    iv,
  );
  cipher.setAAD(Buffer.from(`itemize:admin-mfa:v1:${userId}`));
  const bytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    ring.activeKeyId,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    bytes.toString('base64url'),
  ].join(':');
}

export function decryptMfa(envelope: string, userId: number): string {
  const [version, keyId, iv, tag, bytes, ...rest] = envelope.split(':');
  const key = keys().keys.get(keyId);
  if (version !== 'v1' || !key || !iv || !tag || !bytes || rest.length)
    throw new Error('MFA key unavailable');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  cipher.setAAD(Buffer.from(`itemize:admin-mfa:v1:${userId}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    cipher.update(Buffer.from(bytes, 'base64url')),
    cipher.final(),
  ]).toString('utf8');
}
