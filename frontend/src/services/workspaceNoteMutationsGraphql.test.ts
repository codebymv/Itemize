import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  isWorkspaceNoteGraphqlMutationsEnabled,
  isWorkspaceNoteGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createWorkspaceNoteViaGraphql,
  deleteWorkspaceNoteViaGraphql,
  updateWorkspaceNoteViaGraphql,
} from './workspaceNoteMutationsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
const note = {
  id: 9,
  userId: 7,
  title: 'Plan',
  content: 'Details',
  category: 'General',
  categoryId: 1,
  colorValue: '#3B82F6',
  positionX: 20,
  positionY: 30,
  width: 570,
  height: 350,
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

describe('workspace note GraphQL mutation consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mutationId) });
    vi.mocked(fetchCsrfToken).mockResolvedValue('note-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollback flags independent and default-off', () => {
    vi.stubEnv('VITE_WORKSPACE_NOTE_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL', 'false');
    expect(isWorkspaceNoteGraphqlReadsEnabled()).toBe(false);
    expect(isWorkspaceNoteGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_NOTE_READS_GRAPHQL', 'true');
    expect(isWorkspaceNoteGraphqlReadsEnabled()).toBe(true);
    expect(isWorkspaceNoteGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL', 'true');
    expect(isWorkspaceNoteGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps mutation casing, stable IDs, CSRF, and legacy responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { createWorkspaceNote: note } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            updateWorkspaceNote: { ...note, content: 'Changed' },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteWorkspaceNote: { deletedId: 9 } } }),
      );

    await expect(
      createWorkspaceNoteViaGraphql({
        title: 'Plan',
        color_value: '#3B82F6',
        position_x: 20,
        position_y: 30,
      }),
    ).resolves.toMatchObject({
      id: 9,
      user_id: 7,
      color_value: '#3B82F6',
      position_x: 20,
      category_id: 1,
    });
    await updateWorkspaceNoteViaGraphql(9, { content: 'Changed' });
    await expect(deleteWorkspaceNoteViaGraphql(9)).resolves.toEqual({
      message: 'Note deleted successfully',
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables).toEqual({
      input: {
        title: 'Plan',
        colorValue: '#3B82F6',
        positionX: 20,
        positionY: 30,
      },
    });
    expect(bodies[1].variables).toEqual({
      id: 9,
      input: { mutationId, content: 'Changed' },
    });
    expect(bodies[2].variables).toEqual({ id: 9, mutationId });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });
});
