import {
  WorkspaceContentRepository,
  WorkspaceListRow,
  WorkspaceNoteRow,
  WorkspaceWhiteboardRow,
  WorkspaceWireframeRow,
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

const whiteboardRow = (
  values: Partial<WorkspaceWhiteboardRow> = {},
): WorkspaceWhiteboardRow => ({
  id: 4,
  user_id: 7,
  title: 'Sketch',
  category: 'General',
  category_id: 1,
  canvas_data: [{ drawMode: true, paths: [] }],
  canvas_width: 750,
  canvas_height: 620,
  background_color: '#FFFFFF',
  position_x: 50,
  position_y: 60,
  z_index: 0,
  color_value: '#3B82F6',
  share_token: null,
  is_public: false,
  shared_at: null,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:01:00.000Z'),
  ...values,
});

const wireframeRow = (
  values: Partial<WorkspaceWireframeRow> = {},
): WorkspaceWireframeRow => ({
  id: 5,
  user_id: 7,
  title: 'Flow',
  category: 'General',
  category_id: 1,
  flow_data: {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  position_x: 70,
  position_y: 80,
  width: 600,
  height: 600,
  z_index: 0,
  color_value: '#3B82F6',
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
      createList: jest.fn(),
      createNote: jest.fn(),
      createWhiteboard: jest.fn(),
      createWireframe: jest.fn(),
      batchCanvasPositions: jest.fn(),
      deleteList: jest.fn(),
      deleteNote: jest.fn(),
      deleteWhiteboard: jest.fn(),
      deleteWireframe: jest.fn(),
      findLists: jest.fn(),
      findNotes: jest.fn(),
      findWhiteboards: jest.fn(),
      findWireframes: jest.fn(),
      updateList: jest.fn(),
      updateNote: jest.fn(),
      updateWhiteboard: jest.fn(),
      updateWireframe: jest.fn(),
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

  it('maps whiteboard pages to bounded serialized canvas data', async () => {
    repository.findWhiteboards.mockResolvedValue({
      rows: [whiteboardRow()],
      total: 1,
    });

    const result = await service.whiteboards(7);
    expect(repository.findWhiteboards).toHaveBeenCalledWith({
      userId: 7,
      pageSize: 50,
      offset: 0,
    });
    expect(result.nodes[0]).toMatchObject({
      id: 4,
      userId: 7,
      categoryId: 1,
      canvasData: '[{"drawMode":true,"paths":[]}]',
      canvasWidth: 750,
      canvasHeight: 620,
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

  it('normalizes bounded list creation and canonical defaults', async () => {
    repository.createList.mockResolvedValue({
      kind: 'completed',
      row: listRow(),
    });

    await service.createList(7, {
      title: ' Tasks ',
      category: ' general ',
      colorValue: '#abcdef',
      items: [{ id: ' one ', text: ' Ship ', completed: false }],
      positionX: -10.25,
      positionY: 15.5,
    });

    expect(repository.createList).toHaveBeenCalledWith(7, {
      title: 'Tasks',
      category: 'general',
      colorValue: '#ABCDEF',
      items: [{ id: 'one', text: 'Ship', completed: false }],
      positionX: -10.25,
      positionY: 15.5,
      width: 340,
      height: 265,
    });
  });

  it('requires a list revision and surfaces stale updates as conflicts', async () => {
    const expectedUpdatedAt = new Date('2026-07-18T12:01:00.000Z');
    repository.updateList.mockResolvedValue({
      kind: 'conflict',
      currentUpdatedAt: new Date('2026-07-18T12:02:00.000Z'),
    });

    await expect(
      service.updateList(7, 2, {
        mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
        expectedUpdatedAt,
        items: [{ id: 'one', text: 'Ship', completed: true }],
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'CONFLICT',
        reason: 'STALE_LIST_REVISION',
        currentUpdatedAt: '2026-07-18T12:02:00.000Z',
      },
    });
    expect(repository.updateList).toHaveBeenCalledWith(7, 2, {
      mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      expectedUpdatedAt,
      items: [{ id: 'one', text: 'Ship', completed: true }],
    });
  });

  it('rejects duplicate item identities before writing a list', async () => {
    await expect(
      service.createList(7, {
        title: 'Tasks',
        items: [
          { id: 'same', text: 'First', completed: false },
          { id: 'same', text: 'Second', completed: false },
        ],
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_LIST_ITEM_ID',
      },
    });
    expect(repository.createList).not.toHaveBeenCalled();
  });

  it('rejects an item projection that cannot fit the realtime outbox', async () => {
    await expect(
      service.createList(7, {
        title: 'Oversized',
        items: Array.from({ length: 81 }, (_, index) => ({
          id: `item-${index}`,
          text: 'x'.repeat(500),
          completed: false,
        })),
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'LIST_ITEMS_TOO_LARGE',
      },
    });
    expect(repository.createList).not.toHaveBeenCalled();
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

  it('normalizes a mixed canvas position batch and reports invalid targets', async () => {
    repository.batchCanvasPositions.mockResolvedValue({
      updated: [{
        type: 'wireframe',
        id: 8,
        positionX: 13,
        positionY: 20,
        width: null,
        height: null,
        shareToken: null,
        isPublic: false,
        occurredAt: new Date('2026-07-18T12:02:00.000Z'),
      }],
      missing: [{
        type: 'vault',
        id: 9,
        positionX: 1,
        positionY: 2,
        width: null,
        height: null,
      }],
    });
    const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';

    await expect(service.batchCanvasPositions(7, {
      mutationId,
      updates: [
        {
          type: 'wireframe',
          id: 8,
          positionX: 12.6,
          positionY: 20.4,
        },
        { type: 'vault', id: 9, positionX: 1, positionY: 2 },
        { type: 'mystery', id: 10, positionX: 3, positionY: 4 },
        { type: 'vault', id: 9, positionX: 5, positionY: 6 },
      ],
    })).resolves.toEqual({
      updated: [{
        type: 'wireframe',
        id: 8,
        positionX: 13,
        positionY: 20,
        width: null,
        height: null,
      }],
      failed: [
        { type: 'mystery', id: 10, error: 'Unknown update type' },
        { type: 'vault', id: 9, error: 'Duplicate update target' },
        { type: 'vault', id: 9, error: 'Vault not found' },
      ],
    });
    expect(repository.batchCanvasPositions).toHaveBeenCalledWith(
      7,
      mutationId,
      [
        {
          type: 'wireframe',
          id: 8,
          positionX: 12.6,
          positionY: 20.4,
          width: null,
          height: null,
        },
        {
          type: 'vault',
          id: 9,
          positionX: 1,
          positionY: 2,
          width: null,
          height: null,
        },
      ],
    );
  });

  it('rejects empty and oversized canvas position batches', async () => {
    const mutationId = 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c';
    await expect(service.batchCanvasPositions(7, {
      mutationId,
      updates: [],
    })).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_CANVAS_POSITION_BATCH',
      },
    });
    await expect(service.batchCanvasPositions(7, {
      mutationId,
      updates: Array.from({ length: 251 }, (_, index) => ({
        type: 'list',
        id: index + 1,
        positionX: 1,
        positionY: 2,
      })),
    })).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_CANVAS_POSITION_BATCH',
      },
    });
    expect(repository.batchCanvasPositions).not.toHaveBeenCalled();
  });

  it('normalizes whiteboard creation and rejects invalid canvas JSON', async () => {
    repository.createWhiteboard.mockResolvedValue({
      kind: 'completed',
      row: whiteboardRow(),
    });
    await service.createWhiteboard(7, {
      title: ' Sketch ',
      category: ' general ',
      canvasData: ' [ { "paths": [] } ] ',
      backgroundColor: '#abcdef',
      positionX: -12.5,
    });
    expect(repository.createWhiteboard).toHaveBeenCalledWith(7, {
      title: 'Sketch',
      category: 'general',
      canvasData: '[{"paths":[]}]',
      canvasWidth: 750,
      canvasHeight: 620,
      backgroundColor: '#ABCDEF',
      positionX: -12.5,
      positionY: 2000,
      zIndex: 0,
      colorValue: '#3B82F6',
    });

    await expect(
      service.createWhiteboard(7, {
        title: 'Bad',
        canvasData: '"primitive"',
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_WHITEBOARD_CANVAS',
      },
    });
  });

  it('maps, creates, and revision-guards canonical wireframes', async () => {
    repository.findWireframes.mockResolvedValue({
      rows: [wireframeRow()],
      total: 1,
    });
    const page = await service.wireframes(7);
    expect(page.nodes[0]).toMatchObject({
      id: 5,
      userId: 7,
      flowData: expect.stringContaining('"viewport"'),
      width: 600,
    });

    repository.createWireframe.mockResolvedValue({
      kind: 'completed',
      row: wireframeRow(),
    });
    await service.createWireframe(7, {
      title: ' Flow ',
      category: ' general ',
      flowData:
        ' { "nodes": [], "edges": [], "viewport": { "x": 0, "y": 0, "zoom": 1 } } ',
      positionX: 70.6,
      positionY: 80.4,
      colorValue: '#abcdef',
    });
    expect(repository.createWireframe).toHaveBeenCalledWith(7, {
      title: 'Flow',
      category: 'general',
      flowData:
        '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
      positionX: 71,
      positionY: 80,
      width: 600,
      height: 600,
      zIndex: 0,
      colorValue: '#ABCDEF',
    });

    repository.updateWireframe.mockResolvedValue({
      kind: 'conflict',
      currentUpdatedAt: new Date('2026-07-18T12:02:00.000Z'),
    });
    await expect(service.updateWireframe(7, 5, {
      mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      expectedUpdatedAt: new Date('2026-07-18T12:01:00.000Z'),
      title: 'Changed',
    })).rejects.toMatchObject({
      extensions: {
        code: 'CONFLICT',
        reason: 'STALE_WIREFRAME_REVISION',
        currentUpdatedAt: '2026-07-18T12:02:00.000Z',
      },
    });
  });

  it('rejects invalid wireframe flow data and empty updates', async () => {
    await expect(service.createWireframe(7, {
      flowData: '[]',
    })).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_WIREFRAME_FLOW',
      },
    });
    await expect(service.updateWireframe(7, 5, {
      mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      expectedUpdatedAt: new Date('2026-07-18T12:01:00.000Z'),
    })).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'EMPTY_WIREFRAME_UPDATE',
      },
    });
    expect(repository.createWireframe).not.toHaveBeenCalled();
    expect(repository.updateWireframe).not.toHaveBeenCalled();
  });

  it('requires a whiteboard revision and surfaces stale updates', async () => {
    const expectedUpdatedAt = new Date('2026-07-18T12:01:00.000Z');
    repository.updateWhiteboard.mockResolvedValue({
      kind: 'conflict',
      currentUpdatedAt: new Date('2026-07-18T12:02:00.000Z'),
    });
    await expect(
      service.updateWhiteboard(7, 4, {
        mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
        expectedUpdatedAt,
        title: 'Changed',
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'CONFLICT',
        reason: 'STALE_WHITEBOARD_REVISION',
        currentUpdatedAt: '2026-07-18T12:02:00.000Z',
      },
    });
    expect(repository.updateWhiteboard).toHaveBeenCalledWith(7, 4, {
      mutationId: 'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      expectedUpdatedAt,
      title: 'Changed',
    });
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
