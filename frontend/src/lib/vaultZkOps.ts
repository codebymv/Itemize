import {
  decryptShareSnapshot,
  decryptVaultItem,
  encryptShareSnapshot,
  encryptVaultItem,
  enrollVault,
  recoverVaultKey,
  rewrapVaultKey,
  unlockVaultKey,
  type VaultItemBlob,
  type VaultItemPayload,
  type VaultKdfParams,
} from "./vaultZkCrypto";

const sessions = new Map<number, Uint8Array>();

const requireSession = (vaultId: number): Uint8Array => {
  const vek = sessions.get(vaultId);
  if (!vek) throw new Error("VAULT_SESSION_LOCKED");
  return vek;
};

export type VaultZkRequest =
  | {
      op: "sessionEnroll";
      vaultId: number;
      password: string;
      kdf?: { memoryKiB: number; iterations: number; parallelism: number };
    }
  | {
      op: "sessionUnlock";
      vaultId: number;
      password: string;
      kdf: VaultKdfParams;
      wrappedVek: string;
    }
  | {
      op: "sessionRecover";
      vaultId: number;
      recoverySecret: string;
      wrappedVekRecovery: string;
    }
  | {
      op: "sessionRewrap";
      vaultId: number;
      password: string;
      kdf: VaultKdfParams;
    }
  | { op: "sessionEncryptItems"; vaultId: number; items: VaultItemPayload[] }
  | { op: "sessionDecryptItems"; vaultId: number; blobs: VaultItemBlob[] }
  | { op: "sessionEncryptShare"; vaultId: number; items: VaultItemPayload[] }
  | { op: "sessionMove"; fromVaultId: number; toVaultId: number }
  | { op: "sessionLock"; vaultId: number }
  | { op: "decryptShare"; shareSecret: string; blob: VaultItemBlob };

export async function handleVaultZkRequest(request: VaultZkRequest) {
  switch (request.op) {
    case "sessionEnroll": {
      const enrolled = await enrollVault(request.password, request.kdf);
      sessions.set(request.vaultId, enrolled.vek);
      return {
        kdf: enrolled.kdf,
        wrappedVek: enrolled.wrappedVek,
        wrappedVekRecovery: enrolled.wrappedVekRecovery,
        recoverySecret: enrolled.recoverySecret,
      };
    }
    case "sessionUnlock": {
      const vek = await unlockVaultKey(
        request.password,
        request.kdf,
        request.wrappedVek,
      );
      sessions.set(request.vaultId, vek);
      return { ok: true as const };
    }
    case "sessionRecover": {
      const vek = await recoverVaultKey(
        request.recoverySecret,
        request.wrappedVekRecovery,
      );
      sessions.set(request.vaultId, vek);
      return { ok: true as const };
    }
    case "sessionRewrap": {
      const vek = requireSession(request.vaultId);
      return rewrapVaultKey(vek, request.password, request.kdf);
    }
    case "sessionEncryptItems":
      return Promise.all(
        request.items.map((item) =>
          encryptVaultItem(requireSession(request.vaultId), item),
        ),
      );
    case "sessionDecryptItems":
      return Promise.all(
        request.blobs.map((blob) =>
          decryptVaultItem(requireSession(request.vaultId), blob),
        ),
      );
    case "sessionEncryptShare":
      return encryptShareSnapshot(request.items);
    case "sessionMove": {
      const vek = requireSession(request.fromVaultId);
      sessions.set(request.toVaultId, vek);
      sessions.delete(request.fromVaultId);
      return { ok: true as const };
    }
    case "sessionLock":
      sessions.delete(request.vaultId);
      return { ok: true as const };
    case "decryptShare":
      return decryptShareSnapshot(request.shareSecret, request.blob);
    default:
      throw new Error("Unknown vault crypto operation");
  }
}
