/**
 * Faithful port of the retained calendar token envelope
 * (backend/src/utils/calendarTokenEncryption.js). Envelopes written by
 * either runtime must decrypt in the other, so the format, key ring
 * parsing, AAD, and error behavior are byte-identical; a cross-runtime
 * spec pins the compatibility.
 */
import * as crypto from 'crypto';

const ENVELOPE_PREFIX = 'enc:v1';
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN_TYPES = new Set(['access', 'refresh']);

type Keyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
  usesDevelopmentFallback: boolean;
};

export function parseCalendarTokenKeyring(
  environment: NodeJS.ProcessEnv = process.env,
  options: { allowDevelopmentFallback?: boolean } = {},
): Keyring {
  const {
    allowDevelopmentFallback = environment.NODE_ENV !== 'production',
  } = options;
  const serializedKeys = environment.CALENDAR_TOKEN_ENCRYPTION_KEYS;
  const configuredActiveKeyId = environment.CALENDAR_TOKEN_ACTIVE_KEY_ID;

  if (!serializedKeys && !configuredActiveKeyId && allowDevelopmentFallback) {
    const fallbackSecret =
      environment.JWT_SECRET || 'development-calendar-token-secret';
    return {
      activeKeyId: 'dev-derived-v1',
      keys: new Map([
        [
          'dev-derived-v1',
          crypto.createHash('sha256').update(fallbackSecret).digest(),
        ],
      ]),
      usesDevelopmentFallback: true,
    };
  }

  if (!serializedKeys || !configuredActiveKeyId) {
    throw new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEYS and CALENDAR_TOKEN_ACTIVE_KEY_ID must be configured together',
    );
  }
  if (!KEY_ID_PATTERN.test(configuredActiveKeyId)) {
    throw new Error('CALENDAR_TOKEN_ACTIVE_KEY_ID has an invalid format');
  }

  let parsedKeys: unknown;
  try {
    parsedKeys = JSON.parse(serializedKeys);
  } catch {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEYS must be a JSON object');
  }
  if (!parsedKeys || Array.isArray(parsedKeys) || typeof parsedKeys !== 'object') {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEYS must be a JSON object');
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, keyHex] of Object.entries(
    parsedKeys as Record<string, unknown>,
  )) {
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error(`Calendar token key ID has an invalid format: ${keyId}`);
    }
    if (typeof keyHex !== 'string' || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
      throw new Error(
        `Calendar token key ${keyId} must be 64 hexadecimal characters`,
      );
    }
    keys.set(keyId, Buffer.from(keyHex, 'hex'));
  }
  if (!keys.has(configuredActiveKeyId)) {
    throw new Error(
      'CALENDAR_TOKEN_ACTIVE_KEY_ID is not present in CALENDAR_TOKEN_ENCRYPTION_KEYS',
    );
  }

  return {
    activeKeyId: configuredActiveKeyId,
    keys,
    usesDevelopmentFallback: false,
  };
}

const assertTokenType = (tokenType: string): void => {
  if (!TOKEN_TYPES.has(tokenType)) {
    throw new Error('Calendar token type must be access or refresh');
  }
};

const tokenAad = (tokenType: string): Buffer =>
  Buffer.from(`itemize:calendar-oauth:${tokenType}:v1`, 'utf8');

const encodePart = (value: Buffer): string => value.toString('base64url');
const decodePart = (value: string): Buffer => Buffer.from(value, 'base64url');

export function inspectCalendarTokenEnvelope(
  value: unknown,
): { version: 1; keyId: string } | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(':');
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    return null;
  }
  const [, , keyId, iv, ciphertext, authTag] = parts;
  if (!KEY_ID_PATTERN.test(keyId) || !iv || !ciphertext || !authTag) return null;
  return { version: 1, keyId };
}

export function encryptCalendarToken(
  plaintext: string,
  tokenType: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  assertTokenType(tokenType);
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Calendar token plaintext must be a non-empty string');
  }
  const keyring = parseCalendarTokenKeyring(environment);
  const key = keyring.keys.get(keyring.activeKeyId) as Buffer;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(tokenAad(tokenType));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENVELOPE_PREFIX,
    keyring.activeKeyId,
    encodePart(iv),
    encodePart(ciphertext),
    encodePart(authTag),
  ].join(':');
}

export function decryptCalendarToken(
  envelope: string,
  tokenType: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  assertTokenType(tokenType);
  const metadata = inspectCalendarTokenEnvelope(envelope);
  if (!metadata) {
    throw new Error('Calendar token is not a supported encrypted envelope');
  }
  const keyring = parseCalendarTokenKeyring(environment);
  const key = keyring.keys.get(metadata.keyId);
  if (!key) {
    throw new Error(`Calendar token key is unavailable: ${metadata.keyId}`);
  }
  const [, , , ivPart, ciphertextPart, authTagPart] = envelope.split(':');
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      decodePart(ivPart),
    );
    decipher.setAAD(tokenAad(tokenType));
    decipher.setAuthTag(decodePart(authTagPart));
    return Buffer.concat([
      decipher.update(decodePart(ciphertextPart)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Calendar token envelope failed authentication');
  }
}

export function calendarTokenNeedsRotation(
  envelope: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const metadata = inspectCalendarTokenEnvelope(envelope);
  if (!metadata) return true;
  return metadata.keyId !== parseCalendarTokenKeyring(environment).activeKeyId;
}
