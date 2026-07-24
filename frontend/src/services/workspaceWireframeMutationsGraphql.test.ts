import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createWorkspaceWireframeViaGraphql,
  deleteWorkspaceWireframeViaGraphql,
  disableWorkspaceWireframeSharingViaGraphql,
  enableWorkspaceWireframeSharingViaGraphql,
  updateWorkspaceWireframeViaGraphql,
} from './workspaceWireframeMutationsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
const wireframe = {
  id: 10,
  userId: 7,
  title: 'Flow',
  category: 'General',
  categoryId: 1,
  flowData:
    '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
  positionX: 20,
  positionY: 30,
  width: 600,
  height: 600,
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

describe('workspace wireframe GraphQL mutation consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mutationId) });
    vi.mocked(fetchCsrfToken).mockResolvedValue('wireframe-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('serializes flow JSON and same-wireframe revision updates', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        data: { createWorkspaceWireframe: wireframe },
      }))
      .mockResolvedValueOnce(response({
        data: {
          updateWorkspaceWireframe: {
            ...wireframe,
            title: 'First',
            updatedAt: '2026-07-18T12:02:00.000Z',
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: {
          updateWorkspaceWireframe: {
            ...wireframe,
            title: 'Second',
            updatedAt: '2026-07-18T12:03:00.000Z',
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { deleteWorkspaceWireframe: { deletedId: 10 } },
      }))
      .mockResolvedValueOnce(response({
        data: {
          enableWireframeSharing: {
            shareToken: '621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
            shareUrl:
              'https://itemize.cloud/shared/wireframe/621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
          },
        },
      }))
      .mockResolvedValueOnce(response({
        data: {
          disableWireframeSharing: { sharingDisabled: true },
        },
      }));

    await createWorkspaceWireframeViaGraphql({
      title: 'Flow',
      flow_data: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
    await Promise.all([
      updateWorkspaceWireframeViaGraphql(10, { title: 'First' }),
      updateWorkspaceWireframeViaGraphql(10, { title: 'Second' }),
    ]);
    await expect(
      deleteWorkspaceWireframeViaGraphql(10),
    ).resolves.toEqual({ message: 'Wireframe deleted successfully' });
    await expect(
      enableWorkspaceWireframeSharingViaGraphql(10),
    ).resolves.toEqual({
      shareToken: '621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
      shareUrl:
        'https://itemize.cloud/shared/wireframe/621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
    });
    await expect(
      disableWorkspaceWireframeSharingViaGraphql(10),
    ).resolves.toBeUndefined();

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toMatchObject({
      title: 'Flow',
      flowData: expect.stringContaining('"viewport"'),
    });
    expect(bodies[1].variables.input).toMatchObject({
      mutationId,
      expectedUpdatedAt: wireframe.updatedAt,
      title: 'First',
    });
    expect(bodies[2].variables.input).toMatchObject({
      mutationId,
      expectedUpdatedAt: '2026-07-18T12:02:00.000Z',
      title: 'Second',
    });
    expect(bodies[3].variables).toEqual({ id: 10, mutationId });
    expect(bodies[4].variables).toEqual({ id: 10 });
    expect(bodies[5].variables).toEqual({ id: 10, mutationId });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(6);
  });
});
