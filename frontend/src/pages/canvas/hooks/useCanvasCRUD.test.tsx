import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createList, createNote, createWireframe } from '@/services/api';
import { useCanvasCRUD } from './useCanvasCRUD';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/api', () => ({
  createList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  createWhiteboard: vi.fn(),
  updateWhiteboard: vi.fn(),
  deleteWhiteboard: vi.fn(),
  createWireframe: vi.fn(),
  updateWireframe: vi.fn(),
  deleteWireframe: vi.fn(),
  createVault: vi.fn(),
  updateVault: vi.fn(),
  deleteVault: vi.fn(),
  shareVault: vi.fn(),
  unshareVault: vi.fn(),
}));

const createStateSetters = () => ({
  setLists: vi.fn(),
  setNotes: vi.fn(),
  setWhiteboards: vi.fn(),
  setWireframes: vi.fn(),
  setVaults: vi.fn(),
});

describe('useCanvasCRUD creation coordinates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves zero coordinates returned by the canvas and API', async () => {
    vi.mocked(createList).mockResolvedValue({
      id: '1',
      title: 'Origin list',
      type: 'General',
      items: [],
      position_x: 0,
      position_y: 0,
    });
    const { result } = renderHook(() => useCanvasCRUD(
      null,
      { isCategoryInUse: () => true, addCategory: vi.fn() },
      createStateSetters(),
      vi.fn(),
    ));

    let created;
    await act(async () => {
      created = await result.current.handleCreateList(
        'Origin list',
        'General',
        '#2563eb',
        { x: 0, y: 0 },
      );
    });

    expect(createList).toHaveBeenCalledWith(
      expect.objectContaining({ position_x: 0, position_y: 0 }),
      null,
    );
    expect(created).toEqual(expect.objectContaining({ position_x: 0, position_y: 0 }));
  });

  it('uses a safe default when no creation position is supplied or returned', async () => {
    vi.mocked(createList).mockResolvedValue({
      id: '2',
      title: 'Default list',
      type: 'General',
      items: [],
    });
    const { result } = renderHook(() => useCanvasCRUD(
      null,
      { isCategoryInUse: () => true, addCategory: vi.fn() },
      createStateSetters(),
      vi.fn(),
    ));

    let created;
    await act(async () => {
      created = await result.current.handleCreateList(
        'Default list',
        'General',
        '#2563eb',
      );
    });

    expect(created).toEqual(expect.objectContaining({ position_x: 2000, position_y: 2000 }));
  });

  it('passes preset content into list, note, and wireframe creation payloads', async () => {
    vi.mocked(createList).mockResolvedValue({
      id: '3',
      title: 'Launch',
      type: 'General',
      items: [],
    });
    vi.mocked(createNote).mockResolvedValue({ id: 4, title: 'Brief' });
    vi.mocked(createWireframe).mockResolvedValue({ id: 5, title: 'Landing' });
    const { result } = renderHook(() => useCanvasCRUD(
      null,
      { isCategoryInUse: () => true, addCategory: vi.fn() },
      createStateSetters(),
      vi.fn(),
    ));
    const listItems = [
      { id: 'preset-item-1', text: 'Confirm scope', completed: false },
    ];
    const flowData = {
      nodes: [
        {
          id: 'frame-1',
          type: 'frame',
          position: { x: 0, y: 0 },
          data: { label: 'Landing page' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    await act(async () => {
      await result.current.handleCreateList('Launch', 'General', '#2563eb', undefined, {
        presetId: 'list.project-launch.v1',
        initialCanvasSize: { width: 420, height: 622 },
        listItems,
      });
      await result.current.handleCreateNote('Brief', 'General', '#2563eb', undefined, {
        presetId: 'note.project-brief.v1',
        initialCanvasSize: { width: 680, height: 780 },
        noteContent: '<h2>Goal</h2>',
      });
      await result.current.handleCreateWireframe('Landing', 'General', '#2563eb', undefined, {
        presetId: 'wireframe.landing-page.v1',
        initialCanvasSize: { width: 720, height: 660 },
        wireframeFlowData: flowData,
      });
    });

    expect(createList).toHaveBeenCalledWith(
      expect.objectContaining({
        items: listItems,
        width: 420,
        height: 622,
      }),
      null,
    );
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<h2>Goal</h2>',
        width: 680,
        height: 780,
      }),
      null,
    );
    expect(createWireframe).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: flowData,
        width: 720,
        height: 660,
      }),
      null,
    );
  });

  it('keeps scratch creation on the standard canvas dimensions', async () => {
    vi.mocked(createList).mockResolvedValue({ id: '6', title: 'List', items: [] });
    vi.mocked(createNote).mockResolvedValue({ id: 7, title: 'Note' });
    vi.mocked(createWireframe).mockResolvedValue({ id: 8, title: 'Wireframe' });
    const { result } = renderHook(() => useCanvasCRUD(
      null,
      { isCategoryInUse: () => true, addCategory: vi.fn() },
      createStateSetters(),
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleCreateList('List', 'General', '#2563eb');
      await result.current.handleCreateNote('Note', 'General', '#2563eb');
      await result.current.handleCreateWireframe('Wireframe', 'General', '#2563eb');
    });

    expect(createList).toHaveBeenCalledWith(
      expect.not.objectContaining({ width: expect.any(Number) }),
      null,
    );
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ width: 570, height: 350 }),
      null,
    );
    expect(createWireframe).toHaveBeenCalledWith(
      expect.objectContaining({ width: undefined, height: undefined }),
      null,
    );
  });
});
