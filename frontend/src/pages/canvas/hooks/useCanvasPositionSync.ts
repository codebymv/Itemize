import { useCallback, useRef, useEffect } from 'react';
import { updateCanvasPositions as apiUpdateCanvasPositions, CanvasPositionUpdate } from '@/services/api';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import { POSITION_UPDATE_DEBOUNCE_MS, POSITION_UPDATE_RETRY_MS } from '../constants/canvasConstants';
import { shouldRetryPositionSync } from './positionSyncRetry';

const positionKey = (update: CanvasPositionUpdate): string =>
  `${update.type}:${update.id}`;

const positionBatchSignature = (updates: CanvasPositionUpdate[]): string =>
  JSON.stringify(
    [...updates]
      .sort((left, right) => positionKey(left).localeCompare(positionKey(right)))
      .map((update) => ({
        type: update.type,
        id: Number(update.id),
        positionX: update.position_x,
        positionY: update.position_y,
        width: update.width ?? null,
        height: update.height ?? null,
      })),
  );

export function useCanvasPositionSync() {
  const positionUpdateQueueRef = useRef<Map<string, CanvasPositionUpdate>>(new Map());
  const positionUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { begin, release, reset } = useStableMutationKey('canvas-position-sync');

  const flushPositionUpdates = useCallback(async (retryDelayMs = POSITION_UPDATE_RETRY_MS) => {
    if (positionUpdateTimerRef.current) {
      clearTimeout(positionUpdateTimerRef.current);
      positionUpdateTimerRef.current = null;
    }

    const pendingUpdates = Array.from(positionUpdateQueueRef.current.values());
    if (pendingUpdates.length === 0) {
      return;
    }

    const mutationId = begin(positionBatchSignature(pendingUpdates));
    if (!mutationId) {
      positionUpdateTimerRef.current = setTimeout(() => {
        void flushPositionUpdates(retryDelayMs);
      }, retryDelayMs);
      return;
    }

    positionUpdateQueueRef.current.clear();

    try {
      // Cookies are sent automatically by axios
      await apiUpdateCanvasPositions(pendingUpdates, mutationId);
      reset();
    } catch (error) {
      console.error('Failed to update canvas positions:', error);

      if (shouldRetryPositionSync(error)) {
        pendingUpdates.forEach(update => {
          const key = positionKey(update);
          if (!positionUpdateQueueRef.current.has(key)) {
            positionUpdateQueueRef.current.set(key, update);
          }
        });
        release();
        positionUpdateTimerRef.current = setTimeout(() => {
          void flushPositionUpdates(retryDelayMs);
        }, retryDelayMs);
      } else {
        reset();
      }
    }
  }, [begin, release, reset]);

  const enqueuePositionUpdate = useCallback((update: CanvasPositionUpdate) => {
    positionUpdateQueueRef.current.set(positionKey(update), update);

    if (positionUpdateTimerRef.current) {
      clearTimeout(positionUpdateTimerRef.current);
    }

    positionUpdateTimerRef.current = setTimeout(() => {
      void flushPositionUpdates();
    }, POSITION_UPDATE_DEBOUNCE_MS);
  }, [flushPositionUpdates]);

  useEffect(() => {
    const flushPending = () => {
      if (positionUpdateQueueRef.current.size > 0) {
        void flushPositionUpdates();
      }
    };
    window.addEventListener('beforeunload', flushPending);
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      if (positionUpdateTimerRef.current) {
        clearTimeout(positionUpdateTimerRef.current);
      }
      flushPending();
    };
  }, [flushPositionUpdates]);

  return { enqueuePositionUpdate };
}
