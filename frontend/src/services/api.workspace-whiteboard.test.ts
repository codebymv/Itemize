import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createWhiteboard,
  deleteWhiteboard,
  getWhiteboards,
  updateWhiteboard,
} from './api';
import {
  isWorkspaceWhiteboardGraphqlMutationsEnabled,
  isWorkspaceWhiteboardGraphqlReadsEnabled,
} from './graphqlClient';
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

vi.mock('./graphqlClient', () => ({
  isCategoryGraphqlMutationsEnabled: vi.fn(() => false),
  isCategoryGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceListGraphqlMutationsEnabled: vi.fn(() => false),
  isWorkspaceListGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceNoteGraphqlMutationsEnabled: vi.fn(() => false),
  isWorkspaceNoteGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceWhiteboardGraphqlMutationsEnabled: vi.fn(),
  isWorkspaceWhiteboardGraphqlReadsEnabled: vi.fn(),
}));

vi.mock('./workspaceContentGraphql', () => ({
  getCanvasListsViaGraphql: vi.fn(),
  getWorkspaceListsViaGraphql: vi.fn(),
  getWorkspaceNotesViaGraphql: vi.fn(),
  getWorkspaceWhiteboardsViaGraphql: vi.fn(),
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

describe('workspace whiteboard API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkspaceWhiteboardGraphqlReadsEnabled)
      .mockReturnValue(false);
    vi.mocked(isWorkspaceWhiteboardGraphqlMutationsEnabled)
      .mockReturnValue(false);
  });

  it('keeps reads and CRUD on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { whiteboards: [whiteboard], pagination: {} },
    });
    vi.mocked(api.post).mockResolvedValue({ data: whiteboard });
    vi.mocked(api.put).mockResolvedValue({ data: whiteboard });
    vi.mocked(api.delete).mockResolvedValue({
      data: { message: 'Whiteboard deleted successfully' },
    });

    await getWhiteboards('token');
    await createWhiteboard({ title: 'Sketch' }, 'token');
    await updateWhiteboard(9, { title: 'Changed' }, 'token');
    await deleteWhiteboard(9, 'token');

    expect(api.get).toHaveBeenCalledWith('/api/whiteboards', { headers: {} });
    expect(api.post).toHaveBeenCalledWith(
      '/api/whiteboards',
      { title: 'Sketch' },
      { headers: {} },
    );
    expect(api.put).toHaveBeenCalledWith(
      '/api/whiteboards/9',
      { title: 'Changed' },
      { headers: {} },
    );
    expect(api.delete).toHaveBeenCalledWith('/api/whiteboards/9', {
      headers: {},
    });
  });

  it('routes reads and CRUD through independent GraphQL flags', async () => {
    vi.mocked(isWorkspaceWhiteboardGraphqlReadsEnabled)
      .mockReturnValue(true);
    vi.mocked(isWorkspaceWhiteboardGraphqlMutationsEnabled)
      .mockReturnValue(true);
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

    await getWhiteboards();
    await createWhiteboard({ title: 'Sketch' });
    await updateWhiteboard(9, { title: 'Changed' });
    await deleteWhiteboard(9);

    expect(getWorkspaceWhiteboardsViaGraphql).toHaveBeenCalled();
    expect(createWorkspaceWhiteboardViaGraphql).toHaveBeenCalledWith({
      title: 'Sketch',
    });
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
