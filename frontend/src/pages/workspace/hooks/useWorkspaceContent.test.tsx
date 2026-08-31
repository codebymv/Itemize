import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceContentSnapshotViaGraphql } from '@/services/workspaceContentSnapshotGraphql';
import type { List, Note } from '@/types';
import { useWorkspaceContent } from './useWorkspaceContent';

vi.mock('@/services/workspaceContentSnapshotGraphql', () => ({
  getWorkspaceContentSnapshotViaGraphql: vi.fn(),
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

const snapshot = {
  lists: [list],
  notes: [note],
  whiteboards: [],
  wireframes: [],
  vaults: [],
  pages: {
    lists: { total: 1, hasNextPage: false },
    notes: { total: 1, hasNextPage: false },
    whiteboards: { total: 0, hasNextPage: false },
    wireframes: { total: 0, hasNextPage: false },
    vaults: { total: 0, hasNextPage: false },
  },
};

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
};

describe('useWorkspaceContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceContentSnapshotViaGraphql).mockResolvedValue(snapshot);
  });

  it('loads one cancellable atomic workspace snapshot', async () => {
    const { result } = renderHook(() => useWorkspaceContent('user-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.lists).toEqual([list]);
    expect(result.current.notes).toEqual([note]);
    expect(getWorkspaceContentSnapshotViaGraphql).toHaveBeenCalledOnce();
    expect(vi.mocked(getWorkspaceContentSnapshotViaGraphql).mock.calls[0][0])
      .toBeInstanceOf(AbortSignal);
  });

  it('preserves the last complete snapshot when a refresh fails', async () => {
    const { result } = renderHook(() => useWorkspaceContent('user-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getWorkspaceContentSnapshotViaGraphql)
      .mockRejectedValueOnce(new Error('GraphQL unavailable'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.lists).toEqual([list]);
    expect(result.current.notes).toEqual([note]);
  });

  it('keeps the current snapshot visible during a background refresh', async () => {
    const { result } = renderHook(() => useWorkspaceContent('user-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveSnapshot: ((value: typeof snapshot) => void) | undefined;
    vi.mocked(getWorkspaceContentSnapshotViaGraphql).mockImplementationOnce(
      () => new Promise(resolve => { resolveSnapshot = resolve; }),
    );

    let refreshPromise: Promise<boolean> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    await waitFor(() => expect(result.current.refreshing).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.lists).toEqual([list]);
    expect(result.current.notes).toEqual([note]);

    resolveSnapshot?.(snapshot);
    await act(async () => {
      await refreshPromise;
    });

    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('patches the shared snapshot when a route mutation updates rows', async () => {
    const { result } = renderHook(() => useWorkspaceContent('user-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setLists(current => current.map(item => ({
        ...item,
        title: 'Updated checklist',
      })));
    });

    await waitFor(() => {
      expect(result.current.lists[0].title).toBe('Updated checklist');
    });
  });
});
