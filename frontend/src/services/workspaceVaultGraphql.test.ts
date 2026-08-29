import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addVaultItemsViaGraphql,
  addVaultItemViaGraphql,
  createVaultViaGraphql,
  deleteVaultItemViaGraphql,
  disableVaultSharingViaGraphql,
  enableVaultSharingViaGraphql,
  getVaultsViaGraphql,
  removeVaultPasswordViaGraphql,
  reorderVaultItemsViaGraphql,
  setVaultPasswordViaGraphql,
  updateVaultItemViaGraphql,
  updateVaultViaGraphql,
} from "./workspaceVaultGraphql";
import { fetchCsrfToken } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => "https://api.test.itemize"),
  refreshAuthenticatedSession: vi.fn(),
}));

const vault = {
  id: 12,
  userId: 7,
  title: "Credentials",
  category: "Work",
  colorValue: "#3B82F6",
  positionX: 10,
  positionY: 20,
  width: 400,
  height: 300,
  zIndex: 2,
  isLocked: false,
  encryptionSalt: null,
  itemCount: 1,
  items: [
    {
      id: 2,
      vaultId: 12,
      itemType: "key_value",
      label: "Token",
      value: "secret",
      orderIndex: 0,
      createdAt: "2026-07-23T01:00:00.000Z",
      updatedAt: "2026-07-23T02:00:00.000Z",
    },
  ],
  requiresUnlock: false,
  shareToken: null,
  isPublic: false,
  sharedAt: null,
  createdAt: "2026-07-23T01:00:00.000Z",
  updatedAt: "2026-07-23T02:00:00.000Z",
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe("workspace vault GraphQL consumer", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GRAPHQL_URL", "https://graphql.test.itemize/graphql");
    vi.mocked(fetchCsrfToken).mockResolvedValue("csrf");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("maps list and item fields back to the existing frontend contract", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        data: {
          workspaceVaults: {
            nodes: [vault],
            pageInfo: {
              page: 1,
              pageSize: 50,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          },
        },
      }),
    );
    await expect(getVaultsViaGraphql()).resolves.toMatchObject({
      vaults: [
        {
          id: 12,
          user_id: 7,
          position_x: 10,
          items: [{ vault_id: 12, item_type: "key_value", value: "secret" }],
        },
      ],
      pagination: { page: 1, limit: 50, total: 1 },
    });
  });

  it("sends create mutations with CSRF and camel-case input", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { createWorkspaceVault: vault } }),
    );
    await createVaultViaGraphql({
      title: "Credentials",
      position_x: 10,
      position_y: 20,
      crypto_version: 2,
      kdf_salt: "salt",
      kdf_memory_kib: 65_536,
      kdf_iterations: 3,
      kdf_parallelism: 1,
      wrapped_vek: "wrapped",
      wrapped_vek_recovery: "recovery-wrapped",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({ "x-csrf-token": "csrf" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: {
        input: {
          title: "Credentials",
          positionX: 10,
          positionY: 20,
          cryptoVersion: 2,
          kdfSalt: "salt",
          kdfMemoryKiB: 65_536,
          kdfIterations: 3,
          kdfParallelism: 1,
          wrappedVek: "wrapped",
          wrappedVekRecovery: "recovery-wrapped",
        },
      },
    });
  });

  it("uses the same atomic update mutation for drag positions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { updateWorkspaceVault: vault } }),
    );
    await updateVaultViaGraphql(12, { position_x: 30, position_y: 40 });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: {
        id: 12,
        input: { positionX: 30, positionY: 40 },
      },
    });
  });

  it("maps every encrypted item mutation without retaining REST shapes", async () => {
    const item = vault.items[0];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { addWorkspaceVaultItem: item } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            addWorkspaceVaultItems: { count: 1, items: [item] },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { updateWorkspaceVaultItem: item } }),
      )
      .mockResolvedValueOnce(
        response({
          data: { deleteWorkspaceVaultItem: { deletedId: item.id } },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            reorderWorkspaceVaultItems: { count: 1, items: [item] },
          },
        }),
      );

    const input = {
      item_type: "key_value" as const,
      label: "Token",
      value: "secret",
    };
    await expect(addVaultItemViaGraphql(12, input)).resolves.toMatchObject({
      vault_id: 12,
      item_type: "key_value",
    });
    await expect(addVaultItemsViaGraphql(12, [input])).resolves.toMatchObject({
      count: 1,
      items: [{ vault_id: 12 }],
    });
    await updateVaultItemViaGraphql(12, 2, { label: "New token" });
    await expect(deleteVaultItemViaGraphql(12, 2)).resolves.toMatchObject({
      deletedId: 2,
    });
    await reorderVaultItemsViaGraphql(12, [2]);

    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map((body) => body.variables)).toEqual([
      {
        vaultId: 12,
        input: { itemType: "key_value", label: "Token", value: "secret" },
      },
      {
        vaultId: 12,
        items: [{ itemType: "key_value", label: "Token", value: "secret" }],
      },
      { vaultId: 12, itemId: 2, input: { label: "New token" } },
      { vaultId: 12, itemId: 2 },
      { vaultId: 12, itemIds: [2] },
    ]);
  });

  it("sends ciphertext instead of plaintext for zero-knowledge item writes", async () => {
    const item = {
      ...vault.items[0],
      label: "",
      value: "",
      ciphertext: "Y2lwaGVy",
      iv: "aXY=",
      cryptoVersion: 2,
    };
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { addWorkspaceVaultItem: item } }),
    );
    await addVaultItemViaGraphql(12, {
      item_type: "key_value",
      label: "Token",
      value: "secret",
      ciphertext: "Y2lwaGVy",
      iv: "aXY=",
    });
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)),
    ).toMatchObject({
      variables: {
        vaultId: 12,
        input: { itemType: "key_value", ciphertext: "Y2lwaGVy", iv: "aXY=" },
      },
    });
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).variables
        .input.value,
    ).toBeUndefined();
  });

  it("uses CSRF-protected password mutations without REST password shapes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            setWorkspaceVaultPassword: {
              vaultId: 12,
              isLocked: true,
              encryptionSalt: "salt",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            removeWorkspaceVaultPassword: {
              vaultId: 12,
              isLocked: false,
              encryptionSalt: null,
            },
          },
        }),
      );

    await expect(
      setVaultPasswordViaGraphql(12, "password2", "password1"),
    ).resolves.toMatchObject({ vaultId: 12, isLocked: true });
    await expect(
      removeVaultPasswordViaGraphql(12, "password2"),
    ).resolves.toMatchObject({ vaultId: 12, isLocked: false });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][1]?.headers).toMatchObject({ "x-csrf-token": "csrf" });
    expect(
      calls.map(([, init]) => JSON.parse(String(init?.body)).variables),
    ).toEqual([
      {
        vaultId: 12,
        newPassword: "password2",
        currentPassword: "password1",
      },
      { vaultId: 12, password: "password2" },
    ]);
  });

  it("uses CSRF-protected vault sharing mutations without REST fallback", async () => {
    const token = "00000000-0000-4000-8000-000000000001";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            enableWorkspaceVaultSharing: {
              vaultId: 12,
              shareToken: token,
              shareUrl: `https://itemize.cloud/shared/vault/${token}`,
              isPublic: true,
              sharedAt: "2026-07-24T01:00:00.000Z",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            disableWorkspaceVaultSharing: {
              vaultId: 12,
              shareToken: null,
              shareUrl: null,
              isPublic: false,
              sharedAt: null,
            },
          },
        }),
      );

    await expect(enableVaultSharingViaGraphql(12)).resolves.toEqual({
      shareToken: token,
      shareUrl: `https://itemize.cloud/shared/vault/${token}`,
    });
    await expect(disableVaultSharingViaGraphql(12)).resolves.toEqual({
      message: "Vault sharing disabled",
    });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      expect.objectContaining({
        query: expect.stringContaining("enableWorkspaceVaultSharing"),
        variables: { vaultId: 12, confirmDecryptedSharing: true },
      }),
      expect.objectContaining({
        query: expect.stringContaining("disableWorkspaceVaultSharing"),
        variables: { vaultId: 12 },
      }),
    ]);
    expect(calls[0][1]?.headers).toMatchObject({ "x-csrf-token": "csrf" });
    expect(calls[1][1]?.headers).toMatchObject({ "x-csrf-token": "csrf" });
  });
});
