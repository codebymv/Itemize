import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  isWorkspaceWhiteboardGraphqlMutationsEnabled,
  isWorkspaceWhiteboardGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createWorkspaceWhiteboardViaGraphql,
  deleteWorkspaceWhiteboardViaGraphql,
  updateWorkspaceWhiteboardViaGraphql,
} from './workspaceWhiteboardMutationsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
const whiteboard = {
  id: 9,
  userId: 7,
  title: 'Sketch',
  category: 'General',
  categoryId: 1,
  canvasData: '[{"drawMode":true,"paths":[]}]',
  canvasWidth: 750,
  canvasHeight: 620,
  backgroundColor: '#FFFFFF',
  positionX: 20,
  positionY: 30,
  zIndex: 0,
  colorValue: '#3B82F6',
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

describe('workspace whiteboard GraphQL mutation consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mutationId) });
    vi.mocked(fetchCsrfToken).mockResolvedValue('whiteboard-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps whiteboard read and mutation flags independently default-off', () => {
    expect(isWorkspaceWhiteboardGraphqlReadsEnabled()).toBe(false);
    expect(isWorkspaceWhiteboardGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_WORKSPACE_WHITEBOARD_READS_GRAPHQL', 'true');
    expect(isWorkspaceWhiteboardGraphqlReadsEnabled()).toBe(true);
    expect(isWorkspaceWhiteboardGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_WORKSPACE_WHITEBOARD_MUTATIONS_GRAPHQL', 'true');
    expect(isWorkspaceWhiteboardGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps JSON and serializes same-whiteboard revisions', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        data: { createWorkspaceWhiteboard: whiteboard },
      }))
      .mockResolvedValueOnce(response({
        data: {
          updateWorkspaceWhiteboard: {
            ...whiteboard,
            title: 'First',
            updatedAt: '2026-07-18T12:02:00.000Z',
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: {
          updateWorkspaceWhiteboard: {
            ...whiteboard,
            title: 'Second',
            updatedAt: '2026-07-18T12:03:00.000Z',
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { deleteWorkspaceWhiteboard: { deletedId: 9 } },
      }));

    await createWorkspaceWhiteboardViaGraphql({
      title: 'Sketch',
      canvas_data: [{ drawMode: true, strokeColor: '#000000', strokeWidth: 2, paths: [] }],
    });
    await Promise.all([
      updateWorkspaceWhiteboardViaGraphql(9, { title: 'First' }),
      updateWorkspaceWhiteboardViaGraphql(9, { title: 'Second' }),
    ]);
    await expect(
      deleteWorkspaceWhiteboardViaGraphql(9),
    ).resolves.toEqual({ message: 'Whiteboard deleted successfully' });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toMatchObject({
      title: 'Sketch',
      canvasData: expect.stringContaining('"drawMode":true'),
    });
    expect(bodies[1].variables.input).toMatchObject({
      mutationId,
      expectedUpdatedAt: whiteboard.updatedAt,
      title: 'First',
    });
    expect(bodies[2].variables.input).toMatchObject({
      mutationId,
      expectedUpdatedAt: '2026-07-18T12:02:00.000Z',
      title: 'Second',
    });
    expect(bodies[3].variables).toEqual({ id: 9, mutationId });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
  });
});
