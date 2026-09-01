import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { createList, deleteList, updateList } from './api';
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

describe('workspace list API GraphQL mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes create, update, and delete through GraphQL', async () => {
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

    await createList({ title: 'Tasks', items: [] }, 'ignored-token');
    await updateList(update, 'ignored-token');
    await deleteList('9', 'ignored-token');

    expect(createWorkspaceListViaGraphql).toHaveBeenCalledWith({
      title: 'Tasks',
      items: [],
      width: 320,
    }, expect.any(String));
    expect(updateWorkspaceListViaGraphql).toHaveBeenCalledWith(update);
    expect(deleteWorkspaceListViaGraphql).toHaveBeenCalledWith('9');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('preserves a preset-specific initial size', async () => {
    const sizedList = { ...list, width: 420, height: 622 };
    vi.mocked(createWorkspaceListViaGraphql).mockResolvedValue(sizedList);

    const created = await createList(
      { title: 'Launch', items: [], width: 420, height: 622 },
      'ignored-token',
    );

    expect(createWorkspaceListViaGraphql).toHaveBeenCalledWith({
      title: 'Launch',
      items: [],
      width: 420,
      height: 622,
    }, expect.any(String));
    expect(created).toEqual(expect.objectContaining({ width: 420, height: 622 }));
  });
});
