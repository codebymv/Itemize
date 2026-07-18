import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isWorkspaceListGraphqlReadsEnabled,
  isWorkspaceNoteGraphqlReadsEnabled,
} from './graphqlClient';
import {
  getCanvasListsViaGraphql,
  getWorkspaceListsViaGraphql,
  getWorkspaceNotesViaGraphql,
} from './workspaceContentGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const list = {
  id: 4,
  userId: 7,
  title: 'Tasks',
  category: 'Work',
  categoryId: 2,
  items: [{ id: 'one', text: 'Ship', completed: false }],
  colorValue: '#3B82F6',
  positionX: 10,
  positionY: 20,
  width: 340,
  height: 265,
  zIndex: 1,
  shareToken: null,
  isPublic: false,
  sharedAt: null,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const note = {
  id: 5,
  userId: 7,
  title: 'Plan',
  content: 'Details',
  category: 'Work',
  categoryId: 2,
  colorValue: '#FFFFE0',
  positionX: 30,
  positionY: 40,
  width: 200,
  height: 200,
  zIndex: 2,
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

describe('workspace content GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps list and note reads independently default-off', () => {
    expect(isWorkspaceListGraphqlReadsEnabled()).toBe(false);
    expect(isWorkspaceNoteGraphqlReadsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_LIST_READS_GRAPHQL', 'true');
    expect(isWorkspaceListGraphqlReadsEnabled()).toBe(true);
    expect(isWorkspaceNoteGraphqlReadsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_NOTE_READS_GRAPHQL', 'true');
    expect(isWorkspaceNoteGraphqlReadsEnabled()).toBe(true);
  });

  it('maps list and note pages into the existing REST envelopes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            workspaceLists: {
              nodes: [list],
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
      )
      .mockResolvedValueOnce(
        response({
          data: {
            workspaceNotes: {
              nodes: [note],
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

    await expect(getWorkspaceListsViaGraphql()).resolves.toMatchObject({
      lists: [{
        id: 4,
        user_id: 7,
        category: 'Work',
        type: 'Work',
        category_id: 2,
        position_x: 10,
        created_at: list.createdAt,
      }],
      pagination: { page: 1, limit: 50, total: 1, hasNext: false },
    });
    await expect(getWorkspaceNotesViaGraphql()).resolves.toMatchObject({
      notes: [{
        id: 5,
        user_id: 7,
        content: 'Details',
        category_id: 2,
        position_y: 40,
        updated_at: note.updatedAt,
      }],
      pagination: { page: 1, limit: 50, total: 1, hasPrev: false },
    });
  });

  it('walks every bounded list page for the canvas surface', async () => {
    const pageInfo = {
      pageSize: 100,
      total: 2,
      totalPages: 2,
      hasPreviousPage: false,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            workspaceLists: {
              nodes: [list],
              pageInfo: {
                ...pageInfo,
                page: 1,
                hasNextPage: true,
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            workspaceLists: {
              nodes: [{ ...list, id: 6, title: 'Second' }],
              pageInfo: {
                ...pageInfo,
                page: 2,
                hasNextPage: false,
                hasPreviousPage: true,
              },
            },
          },
        }),
      );

    const result = await getCanvasListsViaGraphql();
    expect(result.map((entry) => entry.id)).toEqual([4, 6]);
    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
  });
});
