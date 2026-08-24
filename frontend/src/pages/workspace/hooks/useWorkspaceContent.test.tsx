import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCanvasLists,
  getNotes,
  getVaults,
  getWhiteboards,
  getWireframes,
} from '@/services/api';
import type { List, Note } from '@/types';
import { useWorkspaceContent } from './useWorkspaceContent';

vi.mock('@/services/api', () => ({
  fetchCanvasLists: vi.fn(),
  getNotes: vi.fn(),
  getVaults: vi.fn(),
  getWhiteboards: vi.fn(),
  getWireframes: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

const list: List = {
  id: '1',
  title: 'Launch checklist',
  type: 'General',
  items: [],
};

const note: Note = {
  id: 2,
  user_id: 1,
  title: 'Release notes',
  content: 'Keep this visible during transient failures.',
  color_value: '#2563eb',
  position_x: 0,
  position_y: 0,
  width: 570,
  height: 350,
  z_index: 0,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};

describe('useWorkspaceContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCanvasLists).mockResolvedValue([list]);
    vi.mocked(getNotes).mockResolvedValue({ notes: [note] });
    vi.mocked(getWhiteboards).mockResolvedValue({ whiteboards: [] });
    vi.mocked(getWireframes).mockResolvedValue({ wireframes: [] });
    vi.mocked(getVaults).mockResolvedValue({ vaults: [] });
  });

  it('loads one atomic workspace snapshot', async () => {
    const { result } = renderHook(() => useWorkspaceContent('token'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.lists).toEqual([list]);
    expect(result.current.notes).toEqual([note]);
  });

  it('preserves the last complete snapshot when one resource fails to refresh', async () => {
    const { result } = renderHook(() => useWorkspaceContent('token'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getNotes).mockRejectedValueOnce(new Error('GraphQL unavailable'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toContain('existing items have not been changed');
    expect(result.current.lists).toEqual([list]);
    expect(result.current.notes).toEqual([note]);
  });
});
