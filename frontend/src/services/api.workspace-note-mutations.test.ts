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

describe('workspace note API GraphQL mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes all six write functions through GraphQL', async () => {
    vi.mocked(createWorkspaceNoteViaGraphql).mockResolvedValue(note);
    vi.mocked(updateWorkspaceNoteViaGraphql).mockResolvedValue(note);
    vi.mocked(deleteWorkspaceNoteViaGraphql).mockResolvedValue({
      message: 'Note deleted successfully',
    });

    await createNote({ title: 'Plan', color_value: '#3B82F6' }, 'ignored-token');
    await updateNote(9, { color_value: '#ABCDEF' }, 'ignored-token');
    await updateNoteContent(9, 'Changed', 'ignored-token');
    await updateNoteTitle(9, 'Changed title', 'ignored-token');
    await updateNoteCategory(9, 'Work', 'ignored-token');
    await deleteNote(9, 'ignored-token');

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
