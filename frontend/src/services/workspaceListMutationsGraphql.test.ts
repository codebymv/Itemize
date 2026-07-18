import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  isWorkspaceListGraphqlMutationsEnabled,
  isWorkspaceListGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createWorkspaceListViaGraphql,
  deleteWorkspaceListViaGraphql,
  updateWorkspaceListViaGraphql,
} from './workspaceListMutationsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
const list = {
  id: 9,
  userId: 7,
  title: 'Tasks',
  category: 'General',
  categoryId: 1,
  items: [{ id: 'one', text: 'Ship', completed: false }],
  colorValue: '#3B82F6',
  positionX: 20,
  positionY: 30,
  width: 320,
  height: 265,
  zIndex: 0,
  shareToken: null,
  isPublic: false,
  sharedAt: null,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('workspace list GraphQL mutation consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mutationId) });
    vi.mocked(fetchCsrfToken).mockResolvedValue('list-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps list read and mutation rollback flags independent', () => {
    vi.stubEnv('VITE_WORKSPACE_LIST_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL', 'false');
    expect(isWorkspaceListGraphqlReadsEnabled()).toBe(false);
    expect(isWorkspaceListGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_LIST_READS_GRAPHQL', 'true');
    expect(isWorkspaceListGraphqlReadsEnabled()).toBe(true);
    expect(isWorkspaceListGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL', 'true');
    expect(isWorkspaceListGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps revisions, casing, stable IDs, CSRF, and legacy responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { createWorkspaceList: list } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            updateWorkspaceList: {
              ...list,
              items: [{ ...list.items[0], completed: true }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteWorkspaceList: { deletedId: 9 } } }),
      );

    await expect(
      createWorkspaceListViaGraphql({
        title: 'Tasks',
        type: 'General',
        color_value: '#3B82F6',
        items: list.items,
      }),
    ).resolves.toMatchObject({
      id: 9,
      user_id: 7,
      category_id: 1,
      updated_at: list.updatedAt,
    });
    await updateWorkspaceListViaGraphql({
      id: 9,
      title: 'Tasks',
      type: 'General',
      items: [{ ...list.items[0], completed: true }],
      updated_at: list.updatedAt,
    });
    await expect(deleteWorkspaceListViaGraphql(9)).resolves.toEqual({
      message: 'List deleted successfully',
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables).toEqual({
      input: {
        title: 'Tasks',
        category: 'General',
        items: list.items,
        colorValue: '#3B82F6',
      },
    });
    expect(bodies[1].variables).toEqual({
      id: 9,
      input: {
        mutationId,
        expectedUpdatedAt: list.updatedAt,
        title: 'Tasks',
        category: 'General',
        items: [{ ...list.items[0], completed: true }],
      },
    });
    expect(bodies[2].variables).toEqual({ id: 9, mutationId });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });

  it('fails closed before transport when the update revision is missing', async () => {
    await expect(
      updateWorkspaceListViaGraphql({
        id: 9,
        title: 'Tasks',
        items: list.items,
      }),
    ).rejects.toThrow('List revision is unavailable');
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });
});
