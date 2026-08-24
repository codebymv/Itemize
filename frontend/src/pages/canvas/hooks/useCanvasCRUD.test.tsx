import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createList } from '@/services/api';
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
});
