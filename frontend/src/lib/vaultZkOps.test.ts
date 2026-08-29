import { describe, expect, it } from "vitest";
import { handleVaultZkRequest } from "./vaultZkOps";

describe("vault zero-knowledge sessions", () => {
  it("moves a prepared draft key to the persisted vault id", async () => {
    await handleVaultZkRequest({
      op: "sessionEnroll",
      vaultId: -1,
      password: "vault-password",
      kdf: { memoryKiB: 32, iterations: 1, parallelism: 1 },
    });

    await handleVaultZkRequest({
      op: "sessionMove",
      fromVaultId: -1,
      toVaultId: 42,
    });

    const [encrypted] = (await handleVaultZkRequest({
      op: "sessionEncryptItems",
      vaultId: 42,
      items: [{ item_type: "key_value", label: "TOKEN", value: "secret" }],
    })) as Array<{ ciphertext: string; iv: string }>;

    await expect(
      handleVaultZkRequest({
        op: "sessionDecryptItems",
        vaultId: 42,
        blobs: [encrypted],
      }),
    ).resolves.toEqual([
      { item_type: "key_value", label: "TOKEN", value: "secret" },
    ]);

    await expect(
      handleVaultZkRequest({
        op: "sessionEncryptItems",
        vaultId: -1,
        items: [{ item_type: "key_value", label: "OLD", value: "session" }],
      }),
    ).rejects.toThrow("VAULT_SESSION_LOCKED");
  });
});
