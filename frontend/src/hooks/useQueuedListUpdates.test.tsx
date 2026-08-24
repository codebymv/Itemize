import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { List } from '@/types';
import { useQueuedListUpdates } from './useQueuedListUpdates';

const list = (items: List['items'], updatedAt: string): List => ({
  id: '7',
  title: 'Release checklist',
  type: 'General',
  items,
  updated_at: updatedAt,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useQueuedListUpdates', () => {
  it('serializes rapid edits and carries the committed revision forward', async () => {
    const firstResponse = deferred<List>();
    const secondResponse = deferred<List>();
    const mutate = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const onError = vi.fn();
    let state = [list([], '2026-08-24T10:00:00.000Z')];
    const snapshots: List[][] = [];
    const setLists: React.Dispatch<React.SetStateAction<List[]>> = (update) => {
      state = typeof update === 'function' ? update(state) : update;
      snapshots.push(state);
    };

    const { result } = renderHook(() => useQueuedListUpdates({
      setLists,
      mutate,
      onError,
    }));

    const firstItem = { id: 'a', text: 'First', completed: false };
    const secondItem = { id: 'b', text: 'Second', completed: false };
    let first!: Promise<List | null>;
    let second!: Promise<List | null>;

    await act(async () => {
      first = result.current(list([firstItem], '2026-08-24T10:00:00.000Z'));
      second = result.current(list([firstItem, secondItem], '2026-08-24T10:00:00.000Z'));
      await Promise.resolve();
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(expect.objectContaining({
      items: [firstItem],
      updated_at: '2026-08-24T10:00:00.000Z',
    }));
    expect(state[0].items).toEqual([firstItem, secondItem]);

    await act(async () => {
      firstResponse.resolve(list([firstItem], '2026-08-24T10:00:01.000Z'));
      await first;
    });

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1][0]).toEqual(expect.objectContaining({
      items: [firstItem, secondItem],
      updated_at: '2026-08-24T10:00:01.000Z',
    }));
    expect(state[0].items).toEqual([firstItem, secondItem]);

    await act(async () => {
      secondResponse.resolve(list([firstItem, secondItem], '2026-08-24T10:00:02.000Z'));
      await second;
    });

    expect(state[0].updated_at).toBe('2026-08-24T10:00:02.000Z');
    expect(onError).not.toHaveBeenCalled();
    expect(snapshots.some((snapshot) => snapshot[0].items.length === 0)).toBe(false);
  });
});
