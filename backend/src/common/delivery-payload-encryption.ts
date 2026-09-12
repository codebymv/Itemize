import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { parseCalendarTokenKeyring } from '../calendar-oauth/calendar-token-encryption';

// Reuse the configured application key ring; use a separate authenticated domain.
export function encryptDeliveryPayload(value: string, identity: string): string {
  const ring = parseCalendarTokenKeyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',ring.keys.get(ring.activeKeyId)!,iv);
  cipher.setAAD(Buffer.from(`itemize:delivery:v1:${identity}`));
  const bytes = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',ring.activeKeyId,iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join(':');
}
export function decryptDeliveryPayload(value: string, identity: string): string {
  const [version,keyId,iv,tag,bytes] = value.split(':');
  const key = parseCalendarTokenKeyring().keys.get(keyId);
  if (version !== 'v1' || !key || !iv || !tag || !bytes) throw new Error('Delivery payload cannot be decrypted');
  const cipher = createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  cipher.setAAD(Buffer.from(`itemize:delivery:v1:${identity}`));
  cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(bytes,'base64url')),cipher.final()]).toString('utf8');
}
