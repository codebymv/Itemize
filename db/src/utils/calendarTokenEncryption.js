const crypto = require('crypto');

const ENVELOPE_PREFIX = 'enc:v1';
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN_TYPES = new Set(['access', 'refresh']);

function parseCalendarTokenKeyring(environment = process.env, options = {}) {
  const { allowDevelopmentFallback = environment.NODE_ENV !== 'production' } = options;
  const serializedKeys = environment.CALENDAR_TOKEN_ENCRYPTION_KEYS;
  const configuredActiveKeyId = environment.CALENDAR_TOKEN_ACTIVE_KEY_ID;

  if (!serializedKeys && !configuredActiveKeyId && allowDevelopmentFallback) {
    const fallbackSecret = environment.JWT_SECRET || 'development-calendar-token-secret';
    return {
      activeKeyId: 'dev-derived-v1',
      keys: new Map([
        ['dev-derived-v1', crypto.createHash('sha256').update(fallbackSecret).digest()],
      ]),
      usesDevelopmentFallback: true,
    };
  }

  if (!serializedKeys || !configuredActiveKeyId) {
    throw new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEYS and CALENDAR_TOKEN_ACTIVE_KEY_ID must be configured together'
    );
  }

  if (!KEY_ID_PATTERN.test(configuredActiveKeyId)) {
    throw new Error('CALENDAR_TOKEN_ACTIVE_KEY_ID has an invalid format');
  }

  let parsedKeys;
  try {
    parsedKeys = JSON.parse(serializedKeys);
  } catch {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEYS must be a JSON object');
  }
  if (!parsedKeys || Array.isArray(parsedKeys) || typeof parsedKeys !== 'object') {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEYS must be a JSON object');
  }

  const keys = new Map();
  for (const [keyId, keyHex] of Object.entries(parsedKeys)) {
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error(`Calendar token key ID has an invalid format: ${keyId}`);
    }
    if (typeof keyHex !== 'string' || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
      throw new Error(`Calendar token key ${keyId} must be 64 hexadecimal characters`);
    }
    keys.set(keyId, Buffer.from(keyHex, 'hex'));
  }

  if (!keys.has(configuredActiveKeyId)) {
    throw new Error('CALENDAR_TOKEN_ACTIVE_KEY_ID is not present in CALENDAR_TOKEN_ENCRYPTION_KEYS');
  }

  return {
    activeKeyId: configuredActiveKeyId,
    keys,
    usesDevelopmentFallback: false,
  };
}

function assertTokenType(tokenType) {
  if (!TOKEN_TYPES.has(tokenType)) {
    throw new Error('Calendar token type must be access or refresh');
  }
}

function tokenAad(tokenType) {
  return Buffer.from(`itemize:calendar-oauth:${tokenType}:v1`, 'utf8');
}

function encodePart(value) {
  return value.toString('base64url');
}

function decodePart(value) {
  return Buffer.from(value, 'base64url');
}

function inspectCalendarTokenEnvelope(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(':');
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) return null;
  const [, , keyId, iv, ciphertext, authTag] = parts;
  if (!KEY_ID_PATTERN.test(keyId) || !iv || !ciphertext || !authTag) return null;
  return { version: 1, keyId };
}

function encryptCalendarToken(plaintext, tokenType, environment = process.env) {
  assertTokenType(tokenType);
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Calendar token plaintext must be a non-empty string');
  }

  const keyring = parseCalendarTokenKeyring(environment);
  const key = keyring.keys.get(keyring.activeKeyId);
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

function decryptCalendarToken(envelope, tokenType, environment = process.env) {
  assertTokenType(tokenType);
  const metadata = inspectCalendarTokenEnvelope(envelope);
  if (!metadata) throw new Error('Calendar token is not a supported encrypted envelope');

  const keyring = parseCalendarTokenKeyring(environment);
  const key = keyring.keys.get(metadata.keyId);
  if (!key) throw new Error(`Calendar token key is unavailable: ${metadata.keyId}`);

  const [, , , ivPart, ciphertextPart, authTagPart] = envelope.split(':');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, decodePart(ivPart));
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

function calendarTokenNeedsRotation(envelope, environment = process.env) {
  const metadata = inspectCalendarTokenEnvelope(envelope);
  if (!metadata) return true;
  return metadata.keyId !== parseCalendarTokenKeyring(environment).activeKeyId;
}

function rotateCalendarToken(envelope, tokenType, environment = process.env) {
  return encryptCalendarToken(
    decryptCalendarToken(envelope, tokenType, environment),
    tokenType,
    environment
  );
}

module.exports = {
  parseCalendarTokenKeyring,
  inspectCalendarTokenEnvelope,
  encryptCalendarToken,
  decryptCalendarToken,
  calendarTokenNeedsRotation,
  rotateCalendarToken,
};
