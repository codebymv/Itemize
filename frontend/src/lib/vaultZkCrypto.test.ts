import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAULT_KDF,
  appendShareFragment,
  decryptShareSnapshot,
  decryptVaultItem,
  encryptShareSnapshot,
  encryptVaultItem,
  enrollVault,
  readShareFragment,
  recoverVaultKey,
  rewrapVaultKey,
  unlockVaultKey,
} from './vaultZkCrypto';

const TEST_KDF = {
  memoryKiB: 32,
  iterations: 1,
  parallelism: 1,
};

describe('vault zero-knowledge crypto', () => {
  it('wraps a VEK so a wrong password cannot unwrap it', async () => {
    const enrolled = await enrollVault('correct-horse', TEST_KDF);
    const vek = await unlockVaultKey(
      'correct-horse',
      enrolled.kdf,
      enrolled.wrappedVek,
    );
    expect(vek).toEqual(enrolled.vek);
    await expect(
      unlockVaultKey('wrong-password', enrolled.kdf, enrolled.wrappedVek),
    ).rejects.toThrow('INVALID_VAULT_PASSWORD');
  });

  it('encrypts item labels and values so ciphertext does not contain plaintext', async () => {
    const enrolled = await enrollVault('password12', TEST_KDF);
    const blob = await encryptVaultItem(enrolled.vek, {
      item_type: 'key_value',
      label: 'API_TOKEN',
      value: 'super-secret',
    });
    expect(blob.ciphertext).not.toContain('super-secret');
    expect(blob.ciphertext).not.toContain('API_TOKEN');
    await expect(decryptVaultItem(enrolled.vek, blob)).resolves.toEqual({
      item_type: 'key_value',
      label: 'API_TOKEN',
      value: 'super-secret',
    });
  });

  it('recovers the same VEK from the emergency kit and rewraps on password change', async () => {
    const enrolled = await enrollVault('old-password', TEST_KDF);
    const recovered = await recoverVaultKey(
      enrolled.recoverySecret,
      enrolled.wrappedVekRecovery,
    );
    expect(recovered).toEqual(enrolled.vek);
    const rewrapped = await rewrapVaultKey(
      enrolled.vek,
      'new-password',
      enrolled.kdf,
    );
    const unlocked = await unlockVaultKey(
      'new-password',
      enrolled.kdf,
      rewrapped.wrappedVek,
    );
    expect(unlocked).toEqual(enrolled.vek);
    await expect(
      unlockVaultKey('old-password', enrolled.kdf, rewrapped.wrappedVek),
    ).rejects.toThrow('INVALID_VAULT_PASSWORD');
  });

  it('makes a share URL without the fragment useless', async () => {
    const snapshot = await encryptShareSnapshot([
      { item_type: 'secure_note', label: 'Note', value: 'hidden' },
    ]);
    const url = appendShareFragment(
      'https://itemize.cloud/shared/vault/00000000-0000-4000-8000-000000000001',
      snapshot.shareSecret,
    );
    expect(readShareFragment('')).toBeNull();
    expect(readShareFragment(new URL(url).hash)).toBe(snapshot.shareSecret);
    await expect(
      decryptShareSnapshot('AAAAAAAAAAAAAAAAAAAAAA', {
        ciphertext: snapshot.ciphertext,
        iv: snapshot.iv,
      }),
    ).rejects.toThrow();
    await expect(
      decryptShareSnapshot(snapshot.shareSecret, {
        ciphertext: snapshot.ciphertext,
        iv: snapshot.iv,
      }),
    ).resolves.toEqual([
      { item_type: 'secure_note', label: 'Note', value: 'hidden' },
    ]);
  });

  it('ships production KDF params above the OWASP Argon2id minimum', () => {
    expect(DEFAULT_VAULT_KDF.memoryKiB).toBeGreaterThanOrEqual(19_456);
    expect(DEFAULT_VAULT_KDF.iterations).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_VAULT_KDF.algorithm).toBe('argon2id');
  });
});
