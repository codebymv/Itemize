import type { Vault, VaultItem } from '@/types';
import { runVaultZk } from './vaultZkClient';
import { DEFAULT_VAULT_KDF } from './vaultZkCrypto';
import {
  migrateVaultToV2ViaGraphql,
  rewrapVaultViaGraphql,
} from '@/services/workspaceVaultGraphql';

export const isVaultZke = (vault: Pick<Vault, 'crypto_version'>): boolean =>
  (vault.crypto_version ?? 1) >= 2;

const toPayload = (item: Pick<VaultItem, 'item_type' | 'label' | 'value'>) => ({
  item_type: item.item_type,
  label: item.label,
  value: item.value,
});

export const decryptZkeVaultItems = async (
  vault: Vault,
): Promise<VaultItem[]> => {
  const source = vault.items ?? [];
  const blobs = source.map((item) => ({
    ciphertext: item.ciphertext || '',
    iv: item.iv || '',
  }));
  if (blobs.some((blob) => !blob.ciphertext || !blob.iv)) {
    throw new Error('Vault ciphertext is incomplete');
  }
  const decrypted = await runVaultZk<Array<{ item_type: VaultItem['item_type']; label: string; value: string }>>({
    op: 'sessionDecryptItems',
    vaultId: vault.id,
    blobs,
  });
  return source.map((item, index) => ({
    ...item,
    item_type: decrypted[index].item_type,
    label: decrypted[index].label,
    value: decrypted[index].value,
  }));
};

export const unlockZkeVault = async (vault: Vault, password: string) => {
  if (!vault.kdf || !vault.wrapped_vek) {
    throw new Error('Vault is missing zero-knowledge metadata');
  }
  await runVaultZk({
    op: 'sessionUnlock',
    vaultId: vault.id,
    password,
    kdf: {
      algorithm: 'argon2id',
      salt: vault.kdf.salt,
      memoryKiB: vault.kdf.memoryKiB,
      iterations: vault.kdf.iterations,
      parallelism: vault.kdf.parallelism,
    },
    wrappedVek: vault.wrapped_vek,
  });
  return decryptZkeVaultItems(vault);
};

export const enrollVaultToV2 = async (
  vault: Vault,
  password: string,
  items: VaultItem[],
  currentPassword?: string,
): Promise<{ vault: Vault; recoverySecret: string }> => {
  const enrolled = await runVaultZk<{
    kdf: {
      salt: string;
      memoryKiB: number;
      iterations: number;
      parallelism: number;
    };
    wrappedVek: string;
    wrappedVekRecovery: string;
    recoverySecret: string;
  }>({
    op: 'sessionEnroll',
    vaultId: vault.id,
    password,
    kdf: DEFAULT_VAULT_KDF,
  });
  const blobs = await runVaultZk<Array<{ ciphertext: string; iv: string }>>({
    op: 'sessionEncryptItems',
    vaultId: vault.id,
    items: items.map(toPayload),
  });
  const migrated = await migrateVaultToV2ViaGraphql(
    vault.id,
    {
      kdfSalt: enrolled.kdf.salt,
      kdfMemoryKiB: enrolled.kdf.memoryKiB,
      kdfIterations: enrolled.kdf.iterations,
      kdfParallelism: enrolled.kdf.parallelism,
      wrappedVek: enrolled.wrappedVek,
      wrappedVekRecovery: enrolled.wrappedVekRecovery,
      items: items.map((item, index) => ({
        id: item.id,
        ciphertext: blobs[index].ciphertext,
        iv: blobs[index].iv,
      })),
    },
    currentPassword,
  );
  return { vault: migrated, recoverySecret: enrolled.recoverySecret };
};

export const encryptZkeItem = async (
  vaultId: number,
  item: { item_type: VaultItem['item_type']; label: string; value: string },
) => {
  const [blob] = await runVaultZk<Array<{ ciphertext: string; iv: string }>>({
    op: 'sessionEncryptItems',
    vaultId,
    items: [toPayload(item)],
  });
  return blob;
};

export const rewrapZkeVault = async (vault: Vault, newPassword: string) => {
  if (!vault.kdf) throw new Error('Vault is missing KDF parameters');
  const rewrapped = await runVaultZk<{
    wrappedVek: string;
    wrappedVekRecovery: string;
    recoverySecret: string;
  }>({
    op: 'sessionRewrap',
    vaultId: vault.id,
    password: newPassword,
    kdf: {
      algorithm: 'argon2id',
      salt: vault.kdf.salt,
      memoryKiB: vault.kdf.memoryKiB,
      iterations: vault.kdf.iterations,
      parallelism: vault.kdf.parallelism,
    },
  });
  await rewrapVaultViaGraphql(vault.id, {
    wrappedVek: rewrapped.wrappedVek,
    wrappedVekRecovery: rewrapped.wrappedVekRecovery,
  });
  return rewrapped.recoverySecret;
};

export const lockZkeSession = async (vaultId: number) => {
  await runVaultZk({ op: 'sessionLock', vaultId });
};

export const encryptVaultShareSnapshot = async (
  vaultId: number,
  items: VaultItem[],
) =>
  runVaultZk<{ shareSecret: string; ciphertext: string; iv: string }>({
    op: 'sessionEncryptShare',
    vaultId,
    items: items.map(toPayload),
  });
