import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { createList, deleteList, updateList } from './api';
import { isWorkspaceListGraphqlMutationsEnabled } from './graphqlClient';
import {
  createWorkspaceListViaGraphql,
  deleteWorkspaceListViaGraphql,
  updateWorkspaceListViaGraphql,
} from './workspaceListMutationsGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isCategoryGraphqlMutationsEnabled: vi.fn(() => false),
  isCategoryGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceListGraphqlMutationsEnabled: vi.fn(),
  isWorkspaceListGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceNoteGraphqlMutationsEnabled: vi.fn(() => false),
  isWorkspaceNoteGraphqlReadsEnabled: vi.fn(() => false),
}));

vi.mock('./workspaceListMutationsGraphql', () => ({
  createWorkspaceListViaGraphql: vi.fn(),
  deleteWorkspaceListViaGraphql: vi.fn(),
  updateWorkspaceListViaGraphql: vi.fn(),
}));

const list = {
  id: 9,
  user_id: 7,
  title: 'Tasks',
  category: 'General',
  type: 'General',
  category_id: 1,
  items: [{ id: 'one', text: 'Ship', completed: false }],
  color_value: '#3B82F6',
  position_x: 20,
  position_y: 30,
  width: 340,
  height: 265,
  z_index: 0,
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('workspace list API mutation transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkspaceListGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps create, update, and delete on REST by default', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: list });
    vi.mocked(api.put).mockResolvedValue({ data: list });
    vi.mocked(api.delete).mockResolvedValue({
      data: { message: 'List deleted successfully' },
    });

    await createList({ title: 'Tasks', items: [] }, 'token');
    await updateList({
      id: 9,
      title: 'Tasks',
      items: list.items,
      updated_at: list.updated_at,
    }, 'token');
    await deleteList('9', 'token');

    expect(api.post).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({ title: 'Tasks', category: 'General' }),
      { headers: {} },
    );
    expect(api.put).toHaveBeenCalledWith(
      '/api/lists/9',
      expect.objectContaining({ title: 'Tasks' }),
      { headers: {} },
    );
    expect(api.delete).toHaveBeenCalledWith('/api/lists/9', {
      headers: {},
    });
    expect(createWorkspaceListViaGraphql).not.toHaveBeenCalled();
  });

  it('routes only list mutations through GraphQL when enabled', async () => {
    vi.mocked(isWorkspaceListGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(createWorkspaceListViaGraphql).mockResolvedValue(list);
    vi.mocked(updateWorkspaceListViaGraphql).mockResolvedValue(list);
    vi.mocked(deleteWorkspaceListViaGraphql).mockResolvedValue({
      message: 'List deleted successfully',
    });
    const update = {
      id: 9,
      title: 'Tasks',
      items: list.items,
      updated_at: list.updated_at,
    };

    await createList({ title: 'Tasks', items: [] });
    await updateList(update);
    await deleteList('9');

    expect(createWorkspaceListViaGraphql).toHaveBeenCalledWith({
      title: 'Tasks',
      items: [],
      width: 320,
    });
    expect(updateWorkspaceListViaGraphql).toHaveBeenCalledWith(update);
    expect(deleteWorkspaceListViaGraphql).toHaveBeenCalledWith('9');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
