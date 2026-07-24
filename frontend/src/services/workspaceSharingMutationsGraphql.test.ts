import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  disableListSharingViaGraphql,
  disableNoteSharingViaGraphql,
  disableWhiteboardSharingViaGraphql,
  enableListSharingViaGraphql,
  enableNoteSharingViaGraphql,
  enableWhiteboardSharingViaGraphql,
} from './workspaceSharingMutationsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
const token = '621ca66e-2b82-46a7-b2ba-e7343b6cbac2';
const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('workspace sharing GraphQL consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mutationId) });
    vi.mocked(fetchCsrfToken).mockResolvedValue('sharing-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses explicit typed mutations for all workspace sharing changes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        data: {
          enableListSharing: {
            shareToken: token,
            shareUrl: `https://itemize.cloud/shared/list/${token}`,
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { disableListSharing: { sharingDisabled: true } },
      }))
      .mockResolvedValueOnce(response({
        data: {
          enableNoteSharing: {
            shareToken: token,
            shareUrl: `https://itemize.cloud/shared/note/${token}`,
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { disableNoteSharing: { sharingDisabled: true } },
      }))
      .mockResolvedValueOnce(response({
        data: {
          enableWhiteboardSharing: {
            shareToken: token,
            shareUrl: `https://itemize.cloud/shared/whiteboard/${token}`,
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { disableWhiteboardSharing: { sharingDisabled: true } },
      }));

    await expect(enableListSharingViaGraphql(2)).resolves.toMatchObject({
      shareToken: token,
    });
    await expect(disableListSharingViaGraphql(2)).resolves.toBeUndefined();
    await expect(enableNoteSharingViaGraphql(3)).resolves.toMatchObject({
      shareToken: token,
    });
    await expect(disableNoteSharingViaGraphql(3)).resolves.toBeUndefined();
    await expect(enableWhiteboardSharingViaGraphql(4)).resolves.toMatchObject({
      shareToken: token,
    });
    await expect(
      disableWhiteboardSharingViaGraphql(4),
    ).resolves.toBeUndefined();

    const calls = vi.mocked(fetch).mock.calls.map((call) => ({
      headers: (call[1] as RequestInit).headers as Record<string, string>,
      body: JSON.parse(String((call[1] as RequestInit).body)) as {
        query: string;
        variables: Record<string, unknown>;
      },
    }));
    expect(calls.map(({ body }) => body.query)).toEqual([
      expect.stringContaining('enableListSharing'),
      expect.stringContaining('disableListSharing'),
      expect.stringContaining('enableNoteSharing'),
      expect.stringContaining('disableNoteSharing'),
      expect.stringContaining('enableWhiteboardSharing'),
      expect.stringContaining('disableWhiteboardSharing'),
    ]);
    expect(calls.map(({ body }) => body.variables)).toEqual([
      { id: 2 },
      { id: 2, mutationId },
      { id: 3 },
      { id: 3, mutationId },
      { id: 4 },
      { id: 4, mutationId },
    ]);
    expect(calls.every(({ headers }) =>
      headers['x-csrf-token'] === 'sharing-csrf')).toBe(true);
    expect(fetchCsrfToken).toHaveBeenCalledTimes(6);
  });
});
