import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createNote,
  deleteNote,
  updateNote,
  updateNoteCategory,
  updateNoteContent,
  updateNoteTitle,
} from './api';
import { isWorkspaceNoteGraphqlMutationsEnabled } from './graphqlClient';
import {
  createWorkspaceNoteViaGraphql,
  deleteWorkspaceNoteViaGraphql,
  updateWorkspaceNoteViaGraphql,
} from './workspaceNoteMutationsGraphql';

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
  isWorkspaceListGraphqlReadsEnabled: vi.fn(() => false),
  isWorkspaceNoteGraphqlMutationsEnabled: vi.fn(),
  isWorkspaceNoteGraphqlReadsEnabled: vi.fn(() => false),
}));

vi.mock('./workspaceNoteMutationsGraphql', () => ({
  createWorkspaceNoteViaGraphql: vi.fn(),
  deleteWorkspaceNoteViaGraphql: vi.fn(),
  updateWorkspaceNoteViaGraphql: vi.fn(),
}));

const note = {
  id: 9,
  user_id: 7,
  title: 'Plan',
  content: 'Details',
  category: 'General',
  category_id: 1,
  color_value: '#3B82F6',
  position_x: 20,
  position_y: 30,
  width: 570,
  height: 350,
  z_index: 0,
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('workspace note API mutation transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkspaceNoteGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps all six write functions on REST by default', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: note });
    vi.mocked(api.put).mockResolvedValue({ data: note });
    vi.mocked(api.delete).mockResolvedValue({
      data: { message: 'Note deleted successfully' },
    });

    await createNote({ title: 'Plan', color_value: '#3B82F6' }, 'token');
    await updateNote(9, { color_value: '#ABCDEF' }, 'token');
    await updateNoteContent(9, 'Changed', 'token');
    await updateNoteTitle(9, 'Changed title', 'token');
    await updateNoteCategory(9, 'Work', 'token');
    await deleteNote(9, 'token');

    expect(api.post).toHaveBeenCalledWith(
      '/api/notes',
      { title: 'Plan', color_value: '#3B82F6' },
      { headers: {} },
    );
    expect(api.put).toHaveBeenCalledTimes(4);
    expect(api.put).toHaveBeenCalledWith(
      '/api/notes/9/content',
      { content: 'Changed' },
      { headers: {} },
    );
    expect(api.delete).toHaveBeenCalledWith('/api/notes/9', {
      headers: {},
    });
    expect(createWorkspaceNoteViaGraphql).not.toHaveBeenCalled();
  });

  it('routes all writes through GraphQL when independently enabled', async () => {
    vi.mocked(isWorkspaceNoteGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(createWorkspaceNoteViaGraphql).mockResolvedValue(note);
    vi.mocked(updateWorkspaceNoteViaGraphql).mockResolvedValue(note);
    vi.mocked(deleteWorkspaceNoteViaGraphql).mockResolvedValue({
      message: 'Note deleted successfully',
    });

    await createNote({ title: 'Plan', color_value: '#3B82F6' });
    await updateNote(9, { color_value: '#ABCDEF' });
    await updateNoteContent(9, 'Changed');
    await updateNoteTitle(9, 'Changed title');
    await updateNoteCategory(9, 'Work');
    await deleteNote(9);

    expect(createWorkspaceNoteViaGraphql).toHaveBeenCalledWith({
      title: 'Plan',
      color_value: '#3B82F6',
    });
    expect(updateWorkspaceNoteViaGraphql).toHaveBeenNthCalledWith(
      1,
      9,
      { color_value: '#ABCDEF' },
    );
    expect(updateWorkspaceNoteViaGraphql).toHaveBeenNthCalledWith(
      2,
      9,
      { content: 'Changed' },
    );
    expect(updateWorkspaceNoteViaGraphql).toHaveBeenNthCalledWith(
      3,
      9,
      { title: 'Changed title' },
    );
    expect(updateWorkspaceNoteViaGraphql).toHaveBeenNthCalledWith(
      4,
      9,
      { category: 'Work' },
    );
    expect(deleteWorkspaceNoteViaGraphql).toHaveBeenCalledWith(9);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
