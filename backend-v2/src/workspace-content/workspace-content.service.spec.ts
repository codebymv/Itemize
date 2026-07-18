import {
  WorkspaceContentRepository,
  WorkspaceListRow,
  WorkspaceNoteRow,
} from './workspace-content.repository';
import { WorkspaceContentService } from './workspace-content.service';

const listRow = (
  values: Partial<WorkspaceListRow> = {},
): WorkspaceListRow => ({
  id: 2,
  user_id: 7,
  title: 'Tasks',
  category: 'General',
  category_id: 1,
  items: [{ id: 'one', text: 'Ship', completed: false }],
  color_value: '#3B82F6',
  position_x: 10,
  position_y: 20,
  width: 340,
  height: 265,
  z_index: 0,
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:01:00.000Z'),
  ...values,
});

const noteRow = (
  values: Partial<WorkspaceNoteRow> = {},
): WorkspaceNoteRow => ({
  id: 3,
  user_id: 7,
  title: 'Plan',
  content: 'Details',
  category: 'General',
  category_id: 1,
  color_value: '#FFFFE0',
  position_x: 30,
  position_y: 40,
  width: 200,
  height: 200,
  z_index: 1,
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:01:00.000Z'),
  ...values,
});

describe('WorkspaceContentService', () => {
  let repository: jest.Mocked<WorkspaceContentRepository>;
  let service: WorkspaceContentService;

  beforeEach(() => {
    repository = {
      createNote: jest.fn(),
      deleteNote: jest.fn(),
      findLists: jest.fn(),
      findNotes: jest.fn(),
      updateNote: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceContentRepository>;
    service = new WorkspaceContentService(repository);
  });

  it('maps list pages and sanitizes malformed JSON items', async () => {
    repository.findLists.mockResolvedValue({
      rows: [
        listRow({
          items: [
            { id: 'one', text: 'Ship', completed: 1 },
            { id: 2, text: 'invalid', completed: false },
          ],
        }),
      ],
      total: 1,
    });

    const result = await service.lists(7);
    expect(repository.findLists).toHaveBeenCalledWith({
      userId: 7,
      pageSize: 50,
      offset: 0,
    });
    expect(result.nodes[0]).toMatchObject({
      id: 2,
      userId: 7,
      category: 'General',
      categoryId: 1,
      items: [{ id: 'one', text: 'Ship', completed: true }],
    });
    expect(result.pageInfo).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('maps note pages and normalizes legacy null fields', async () => {
    repository.findNotes.mockResolvedValue({
      rows: [
        noteRow({
          title: null,
          content: null,
          category: null,
          position_x: null,
        }),
      ],
      total: 1,
    });

    const result = await service.notes(7);
    expect(result.nodes[0]).toMatchObject({
      title: 'Untitled Note',
      content: '',
      category: 'General',
      positionX: 0,
    });
  });

  it('normalizes filters and strict pagination', async () => {
    repository.findLists.mockResolvedValue({ rows: [], total: 0 });
    await service.lists(
      7,
      { search: ' tasks ', categoryId: 4 },
      { page: 2, pageSize: 10 },
    );
    expect(repository.findLists).toHaveBeenCalledWith({
      userId: 7,
      search: 'tasks',
      categoryId: 4,
      pageSize: 10,
      offset: 10,
    });

    await expect(
      service.notes(7, {}, { page: 0, pageSize: 50 }),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'page' },
    });
    await expect(
      service.notes(7, { categoryId: 0 }),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'categoryId' },
    });
  });

  it('maps database failures to a stable unavailable error', async () => {
    repository.findNotes.mockRejectedValue(new Error('connection details'));
    await expect(service.notes(7)).rejects.toMatchObject({
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('normalizes note creation and writes canonical defaults', async () => {
    repository.createNote.mockResolvedValue({
      kind: 'completed',
      row: noteRow(),
    });

    await service.createNote(7, {
      title: ' Plan ',
      category: ' general ',
      colorValue: '#abcdef',
    });

    expect(repository.createNote).toHaveBeenCalledWith(7, {
      title: 'Plan',
      content: '',
      category: 'general',
      colorValue: '#ABCDEF',
      positionX: 2000,
      positionY: 2000,
      width: null,
      height: null,
      zIndex: 0,
    });
  });

  it('preserves fractional canvas coordinates for note mutations', async () => {
    repository.createNote.mockResolvedValue({
      kind: 'completed',
      row: noteRow({
        position_x: 2013.7268237520689,
        position_y: 1987.125,
      }),
    });

    await service.createNote(7, {
      title: 'Fractional position',
      positionX: 2013.7268237520689,
      positionY: 1987.125,
    });

    expect(repository.createNote).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        positionX: 2013.7268237520689,
        positionY: 1987.125,
      }),
    );
  });

  it('classifies granular note updates for realtime parity', async () => {
    repository.updateNote.mockResolvedValue({
      kind: 'completed',
      row: noteRow({ content: 'Changed' }),
    });
    const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';

    await service.updateNote(7, 3, {
      mutationId,
      content: 'Changed',
    });

    expect(repository.updateNote).toHaveBeenCalledWith(7, 3, {
      mutationId,
      content: 'Changed',
      eventType: 'CONTENT_CHANGED',
    });
  });

  it('rejects empty, null, and malformed note mutations before querying', async () => {
    const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
    await expect(
      service.updateNote(7, 3, { mutationId }),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'EMPTY_NOTE_UPDATE' },
    });
    await expect(
      service.updateNote(7, 3, { mutationId, title: null }),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'title' },
    });
    await expect(
      service.deleteNote(7, 3, 'not-a-uuid'),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'mutationId' },
    });
    expect(repository.updateNote).not.toHaveBeenCalled();
    expect(repository.deleteNote).not.toHaveBeenCalled();
  });
});
