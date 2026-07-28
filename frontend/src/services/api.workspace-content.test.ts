import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  fetchCanvasLists,
  getLists,
  getNotes,
  getWireframes,
  updateCanvasPositions,
} from './api';
import {
  getCanvasListsViaGraphql,
  getWorkspaceListsViaGraphql,
  getWorkspaceNotesViaGraphql,
  getWorkspaceWireframesViaGraphql,
  updateCanvasPositionsViaGraphql,
} from './workspaceContentGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('./workspaceContentGraphql', () => ({
  getCanvasListsViaGraphql: vi.fn(),
  getWorkspaceListsViaGraphql: vi.fn(),
  getWorkspaceNotesViaGraphql: vi.fn(),
  getWorkspaceWireframesViaGraphql: vi.fn(),
  updateCanvasPositionsViaGraphql: vi.fn(),
  whiteboardFields: '',
  wireframeFields: '',
}));

vi.mock('./workspaceWireframeMutationsGraphql', () => ({
  createWorkspaceWireframeViaGraphql: vi.fn(),
  deleteWorkspaceWireframeViaGraphql: vi.fn(),
  updateWorkspaceWireframeViaGraphql: vi.fn(),
}));

const list = {
  id: 4,
  title: 'Tasks',
  category: 'Work',
  items: [],
  color_value: '#3B82F6',
  position_x: 10,
  position_y: 20,
  width: 340,
  height: 265,
  created_at: '2026-07-18T12:00:00.000Z',
};

describe('workspace content API GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes list and note reads through GraphQL', async () => {
    vi.mocked(getWorkspaceListsViaGraphql).mockResolvedValue({
      lists: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
    vi.mocked(getCanvasListsViaGraphql).mockResolvedValue([{
      ...list,
      id: 4,
      user_id: 7,
      type: 'Work',
      category_id: 2,
      z_index: 0,
      share_token: null,
      is_public: false,
      shared_at: null,
      updated_at: list.created_at,
    }]);
    vi.mocked(getWorkspaceNotesViaGraphql).mockResolvedValue({
      notes: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });

    await getLists('ignored-token');
    const canvas = await fetchCanvasLists('ignored-token');
    await getNotes('ignored-token');

    expect(canvas[0]).toMatchObject({
      id: 4,
      type: 'Work',
      createdAt: new Date(list.created_at),
    });
    expect(getWorkspaceListsViaGraphql).toHaveBeenCalled();
    expect(getCanvasListsViaGraphql).toHaveBeenCalled();
    expect(getWorkspaceNotesViaGraphql).toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('always persists mixed canvas positions through GraphQL', async () => {
    vi.mocked(updateCanvasPositionsViaGraphql).mockResolvedValue({
      updated: [{
        type: 'list',
        id: 4,
        position_x: 12.5,
        position_y: 20,
      }],
      failed: [],
    });
    const updates = [{
      type: 'list' as const,
      id: 4,
      position_x: 12.5,
      position_y: 20,
    }];

    await expect(updateCanvasPositions(updates)).resolves.toMatchObject({
      updated: [{ id: 4, position_x: 12.5 }],
      failed: [],
    });
    expect(updateCanvasPositionsViaGraphql).toHaveBeenCalledWith(updates);
  });

  it('always reads wireframes through GraphQL without a REST fallback', async () => {
    vi.mocked(getWorkspaceWireframesViaGraphql).mockResolvedValue({
      wireframes: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
    await expect(getWireframes()).resolves.toMatchObject({ wireframes: [] });
    expect(getWorkspaceWireframesViaGraphql).toHaveBeenCalledOnce();
    expect(api.get).not.toHaveBeenCalled();
  });
});
