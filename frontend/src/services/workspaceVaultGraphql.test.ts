import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addVaultItemsViaGraphql,
  addVaultItemViaGraphql,
  createVaultViaGraphql,
  deleteVaultItemViaGraphql,
  getVaultsViaGraphql,
  reorderVaultItemsViaGraphql,
  updateVaultItemViaGraphql,
  updateVaultViaGraphql,
} from './workspaceVaultGraphql';
import { fetchCsrfToken } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const vault = {
  id: 12,
  userId: 7,
  title: 'Credentials',
  category: 'Work',
  colorValue: '#3B82F6',
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
      itemType: 'key_value',
      label: 'Token',
      value: 'secret',
      orderIndex: 0,
      createdAt: '2026-07-23T01:00:00.000Z',
      updatedAt: '2026-07-23T02:00:00.000Z',
    },
  ],
  requiresUnlock: false,
  shareToken: null,
  isPublic: false,
  sharedAt: null,
  createdAt: '2026-07-23T01:00:00.000Z',
  updatedAt: '2026-07-23T02:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('workspace vault GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.mocked(fetchCsrfToken).mockResolvedValue('csrf');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps list and item fields back to the existing frontend contract', async () => {
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
          items: [{ vault_id: 12, item_type: 'key_value', value: 'secret' }],
        },
      ],
      pagination: { page: 1, limit: 50, total: 1 },
    });
  });

  it('sends create mutations with CSRF and camel-case input', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { createWorkspaceVault: vault } }),
    );
    await createVaultViaGraphql({
      title: 'Credentials',
      position_x: 10,
      position_y: 20,
      master_password: 'password1',
    });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({ 'x-csrf-token': 'csrf' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: {
        input: {
          title: 'Credentials',
          positionX: 10,
          positionY: 20,
          masterPassword: 'password1',
        },
      },
    });
  });

  it('uses the same atomic update mutation for drag positions', async () => {
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

  it('maps every encrypted item mutation without retaining REST shapes', async () => {
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
      item_type: 'key_value' as const,
      label: 'Token',
      value: 'secret',
    };
    await expect(addVaultItemViaGraphql(12, input)).resolves.toMatchObject({
      vault_id: 12,
      item_type: 'key_value',
    });
    await expect(addVaultItemsViaGraphql(12, [input])).resolves.toMatchObject({
      count: 1,
      items: [{ vault_id: 12 }],
    });
    await updateVaultItemViaGraphql(12, 2, { label: 'New token' });
    await expect(deleteVaultItemViaGraphql(12, 2)).resolves.toMatchObject({
      deletedId: 2,
    });
    await reorderVaultItemsViaGraphql(12, [2]);

    const bodies = vi.mocked(fetch).mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(bodies.map((body) => body.variables)).toEqual([
      {
        vaultId: 12,
        input: { itemType: 'key_value', label: 'Token', value: 'secret' },
      },
      {
        vaultId: 12,
        items: [{ itemType: 'key_value', label: 'Token', value: 'secret' }],
      },
      { vaultId: 12, itemId: 2, input: { label: 'New token' } },
      { vaultId: 12, itemId: 2 },
      { vaultId: 12, itemIds: [2] },
    ]);
  });
});
