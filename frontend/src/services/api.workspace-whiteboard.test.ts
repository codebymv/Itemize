import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createWhiteboard,
  deleteWhiteboard,
  getWhiteboards,
  updateWhiteboard,
} from './api';
import {
  createWorkspaceWhiteboardViaGraphql,
  deleteWorkspaceWhiteboardViaGraphql,
  updateWorkspaceWhiteboardViaGraphql,
} from './workspaceWhiteboardMutationsGraphql';
import { getWorkspaceWhiteboardsViaGraphql } from './workspaceContentGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./workspaceContentGraphql', () => ({
  getCanvasListsViaGraphql: vi.fn(),
  getWorkspaceListsViaGraphql: vi.fn(),
  getWorkspaceNotesViaGraphql: vi.fn(),
  getWorkspaceWhiteboardsViaGraphql: vi.fn(),
  getWorkspaceWireframesViaGraphql: vi.fn(),
  updateCanvasPositionsViaGraphql: vi.fn(),
  workspaceContentExistsViaGraphql: vi.fn(),
  wireframeFields: '',
}));

vi.mock('./workspaceWhiteboardMutationsGraphql', () => ({
  createWorkspaceWhiteboardViaGraphql: vi.fn(),
  deleteWorkspaceWhiteboardViaGraphql: vi.fn(),
  updateWorkspaceWhiteboardViaGraphql: vi.fn(),
}));

const whiteboard = {
  id: 9,
  user_id: 7,
  title: 'Sketch',
  category: 'General',
  category_id: 1,
  canvas_data: [],
  canvas_width: 750,
  canvas_height: 620,
  background_color: '#FFFFFF',
  position_x: 20,
  position_y: 30,
  z_index: 0,
  color_value: '#3B82F6',
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('workspace whiteboard API GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes reads and CRUD through GraphQL', async () => {
    vi.mocked(getWorkspaceWhiteboardsViaGraphql).mockResolvedValue({
      whiteboards: [whiteboard],
      pagination: {
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
    vi.mocked(createWorkspaceWhiteboardViaGraphql)
      .mockResolvedValue(whiteboard);
    vi.mocked(updateWorkspaceWhiteboardViaGraphql)
      .mockResolvedValue(whiteboard);
    vi.mocked(deleteWorkspaceWhiteboardViaGraphql)
      .mockResolvedValue({ message: 'Whiteboard deleted successfully' });

    await getWhiteboards('ignored-token');
    await createWhiteboard({ title: 'Sketch' }, 'ignored-token');
    await updateWhiteboard(9, { title: 'Changed' }, 'ignored-token');
    await deleteWhiteboard(9, 'ignored-token');

    expect(getWorkspaceWhiteboardsViaGraphql).toHaveBeenCalled();
    expect(createWorkspaceWhiteboardViaGraphql).toHaveBeenCalledWith({
      title: 'Sketch',
    }, expect.any(String));
    expect(updateWorkspaceWhiteboardViaGraphql).toHaveBeenCalledWith(
      9,
      { title: 'Changed' },
    );
    expect(deleteWorkspaceWhiteboardViaGraphql).toHaveBeenCalledWith(9);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
