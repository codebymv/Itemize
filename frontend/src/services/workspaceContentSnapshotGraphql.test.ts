import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest } from './graphqlClient';
import { getWorkspaceContentSnapshotViaGraphql } from './workspaceContentSnapshotGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(),
  graphqlRequest: vi.fn(),
}));

const pageInfo = {
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

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

describe('workspace content snapshot GraphQL consumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads all route-owned content families in one cancellable operation', async () => {
    const controller = new AbortController();
    vi.mocked(graphqlRequest).mockResolvedValueOnce({
      workspaceLists: { nodes: [list], pageInfo },
      workspaceNotes: { nodes: [note], pageInfo },
      workspaceWhiteboards: { nodes: [], pageInfo: { ...pageInfo, total: 0 } },
      workspaceWireframes: { nodes: [], pageInfo: { ...pageInfo, total: 0 } },
      workspaceVaults: { nodes: [], pageInfo: { ...pageInfo, total: 0 } },
    });

    await expect(getWorkspaceContentSnapshotViaGraphql(controller.signal))
      .resolves.toMatchObject({
        lists: [{ id: 4, title: 'Tasks', type: 'Work' }],
        notes: [{ id: 5, content: 'Details' }],
        pages: {
          lists: { total: 1, hasNextPage: false },
          vaults: { total: 0, hasNextPage: false },
        },
      });
    expect(graphqlRequest).toHaveBeenCalledOnce();
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query WorkspaceContentSnapshot'),
      { page: { page: 1, pageSize: 50 } },
      undefined,
      controller.signal,
    );
    const query = String(vi.mocked(graphqlRequest).mock.calls[0][0]);
    for (const field of [
      'workspaceLists',
      'workspaceNotes',
      'workspaceWhiteboards',
      'workspaceWireframes',
      'workspaceVaults',
    ]) expect(query).toContain(field);
  });
});
