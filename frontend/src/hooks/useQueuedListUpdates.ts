import { useCallback, useRef } from 'react';
import type React from 'react';
import type { List } from '@/types';

type QueueState = {
  committed: List;
  pending: number;
  sequence: number;
  tail: Promise<void>;
};

type QueuedListUpdatesOptions = {
  setLists: React.Dispatch<React.SetStateAction<List[]>>;
  mutate: (list: List) => Promise<List>;
  onError: (error: unknown, attemptedList: List) => void;
};

/**
 * Serializes revision-fenced list writes per list while keeping the UI
 * optimistic. A later edit waits for the previous response and inherits its
 * server revision, so normal rapid input cannot conflict with itself.
 */
export function useQueuedListUpdates({
  setLists,
  mutate,
  onError,
}: QueuedListUpdatesOptions) {
  const queues = useRef(new Map<string, QueueState>());

  return useCallback((desiredList: List): Promise<List | null> => {
    const id = String(desiredList.id);
    let queue = queues.current.get(id);

    if (!queue) {
      queue = {
        committed: desiredList,
        pending: 0,
        sequence: 0,
        tail: Promise.resolve(),
      };
      queues.current.set(id, queue);
    } else if (
      queue.pending === 0 &&
      desiredList.updated_at &&
      desiredList.updated_at !== queue.committed.updated_at
    ) {
      // Adopt a newer revision delivered by a refresh or realtime event.
      queue.committed = desiredList;
    }

    const currentQueue = queue;
    const sequence = ++currentQueue.sequence;
    currentQueue.pending += 1;

    setLists((current) => current.map((candidate) =>
      candidate.id === desiredList.id ? desiredList : candidate));

    const result = currentQueue.tail.then(async () => {
      const updated = await mutate({
        ...desiredList,
        updated_at: currentQueue.committed.updated_at,
      });
      currentQueue.committed = updated;

      // Do not paint an older response over a newer optimistic edit.
      if (currentQueue.sequence === sequence) {
        setLists((current) => current.map((candidate) =>
          candidate.id === desiredList.id ? updated : candidate));
      }
      return updated;
    }).catch((error: unknown) => {
      if (currentQueue.sequence === sequence) {
        setLists((current) => current.map((candidate) =>
          candidate.id === desiredList.id ? currentQueue.committed : candidate));
      }
      onError(error, desiredList);
      return null;
    }).finally(() => {
      currentQueue.pending -= 1;
    });

    currentQueue.tail = result.then(() => undefined);
    return result;
  }, [mutate, onError, setLists]);
}
