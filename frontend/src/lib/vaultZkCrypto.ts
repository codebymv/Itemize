import { argon2id } from 'hash-wasm';

export const VAULT_CRYPTO_VERSION = 2;

export const DEFAULT_VAULT_KDF = {
  algorithm: 'argon2id' as const,
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
};

export type VaultKdfParams = {
  algorithm: 'argon2id';
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
};

export type VaultItemPayload = {
  item_type: 'key_value' | 'secure_note';
  label: string;
  value: string;
};

export type VaultItemBlob = {
  ciphertext: string;
  iv: string;
};

const INFO_UNLOCK = utf8('itemize/vault-unlock');
const INFO_SHARE = utf8('itemize/vault-share');
const INFO_RECOVERY = utf8('itemize/vault-recovery');
const HKDF_SALT = utf8('itemize-vault-hkdf-v1');

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToUrlB64(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function urlB64ToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return b64ToBytes(padded + pad);
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function encodeWrapped(iv: string, ciphertext: string): string {
  return `${iv}.${ciphertext}`;
}

export function decodeWrapped(wrapped: string): { iv: string; ciphertext: string } {
  const index = wrapped.indexOf('.');
  if (index <= 0 || index === wrapped.length - 1) {
    throw new Error('Invalid wrapped key');
  }
  return {
    iv: wrapped.slice(0, index),
    ciphertext: wrapped.slice(index + 1),
  };
}

export async function deriveMasterKey(
  password: string,
  kdf: VaultKdfParams,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt: b64ToBytes(kdf.salt),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  return hash instanceof Uint8Array ? hash : new Uint8Array(hash);
}

async function hkdf(ikm: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
): Promise<VaultItemBlob> {
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(ciphertext) };
}

async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  blob: VaultItemBlob,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(blob.iv) },
      key,
      b64ToBytes(blob.ciphertext),
    ),
  );
}

export async function wrapKey(
  wrappingKey: Uint8Array,
  secret: Uint8Array,
): Promise<string> {
  const blob = await aesGcmEncrypt(wrappingKey, secret);
  return encodeWrapped(blob.iv, blob.ciphertext);
}

export async function unwrapKey(
  wrappingKey: Uint8Array,
  wrapped: string,
): Promise<Uint8Array> {
  try {
    return await aesGcmDecrypt(wrappingKey, decodeWrapped(wrapped));
  } catch {
    throw new Error('INVALID_VAULT_PASSWORD');
  }
}

export async function enrollVault(password: string, kdf: Omit<VaultKdfParams, 'salt' | 'algorithm'> = DEFAULT_VAULT_KDF) {
  const params: VaultKdfParams = {
    algorithm: 'argon2id',
    salt: bytesToB64(randomBytes(16)),
    memoryKiB: kdf.memoryKiB,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
  };
  const vek = randomBytes(32);
  const recoverySecret = randomBytes(16);
  const masterKey = await deriveMasterKey(password, params);
  const unlockKey = await hkdf(masterKey, INFO_UNLOCK);
  const recoveryKey = await hkdf(recoverySecret, INFO_RECOVERY);
  return {
    kdf: params,
    vek,
    wrappedVek: await wrapKey(unlockKey, vek),
    wrappedVekRecovery: await wrapKey(recoveryKey, vek),
    recoverySecret: bytesToUrlB64(recoverySecret),
  };
}

export async function unlockVaultKey(
  password: string,
  kdf: VaultKdfParams,
  wrappedVek: string,
): Promise<Uint8Array> {
  const masterKey = await deriveMasterKey(password, kdf);
  const unlockKey = await hkdf(masterKey, INFO_UNLOCK);
  return unwrapKey(unlockKey, wrappedVek);
}

export async function recoverVaultKey(
  recoverySecret: string,
  wrappedVekRecovery: string,
): Promise<Uint8Array> {
  const recoveryKey = await hkdf(urlB64ToBytes(recoverySecret), INFO_RECOVERY);
  return unwrapKey(recoveryKey, wrappedVekRecovery);
}

export async function rewrapVaultKey(
  vek: Uint8Array,
  newPassword: string,
  kdf: VaultKdfParams,
): Promise<{ wrappedVek: string; wrappedVekRecovery: string; recoverySecret: string }> {
  const masterKey = await deriveMasterKey(newPassword, kdf);
  const unlockKey = await hkdf(masterKey, INFO_UNLOCK);
  const recoverySecret = randomBytes(16);
  const recoveryKey = await hkdf(recoverySecret, INFO_RECOVERY);
  return {
    wrappedVek: await wrapKey(unlockKey, vek),
    wrappedVekRecovery: await wrapKey(recoveryKey, vek),
    recoverySecret: bytesToUrlB64(recoverySecret),
  };
}

export async function encryptVaultItem(
  vek: Uint8Array,
  item: VaultItemPayload,
): Promise<VaultItemBlob> {
  return aesGcmEncrypt(vek, utf8(JSON.stringify({
    label: item.label,
    value: item.value,
    itemType: item.item_type,
  })));
}

export async function decryptVaultItem(
  vek: Uint8Array,
  blob: VaultItemBlob,
): Promise<VaultItemPayload> {
  const plaintext = new TextDecoder().decode(await aesGcmDecrypt(vek, blob));
  const parsed = JSON.parse(plaintext) as {
    label?: string;
    value?: string;
    itemType?: VaultItemPayload['item_type'];
  };
  if (typeof parsed.label !== 'string' || typeof parsed.value !== 'string') {
    throw new Error('Invalid vault item payload');
  }
  return {
    item_type: parsed.itemType === 'secure_note' ? 'secure_note' : 'key_value',
    label: parsed.label,
    value: parsed.value,
  };
}

export async function encryptShareSnapshot(
  items: VaultItemPayload[],
): Promise<{ shareSecret: string; ciphertext: string; iv: string }> {
  const shareSecret = randomBytes(16);
  const shareKey = await hkdf(shareSecret, INFO_SHARE);
  const blob = await aesGcmEncrypt(shareKey, utf8(JSON.stringify({ items })));
  return {
    shareSecret: bytesToUrlB64(shareSecret),
    ciphertext: blob.ciphertext,
    iv: blob.iv,
  };
}

export async function decryptShareSnapshot(
  shareSecret: string,
  blob: VaultItemBlob,
): Promise<VaultItemPayload[]> {
  const shareKey = await hkdf(urlB64ToBytes(shareSecret), INFO_SHARE);
  const plaintext = new TextDecoder().decode(await aesGcmDecrypt(shareKey, blob));
  const parsed = JSON.parse(plaintext) as { items?: VaultItemPayload[] };
  if (!Array.isArray(parsed.items)) {
    throw new Error('Invalid share snapshot');
  }
  return parsed.items;
}

export function appendShareFragment(shareUrl: string, shareSecret: string): string {
  const [base] = shareUrl.split('#');
  return `${base}#${shareSecret}`;
}

export function readShareFragment(hash: string): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return value.length > 0 ? value : null;
}
