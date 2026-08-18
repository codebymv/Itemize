import { useCallback, useRef, useEffect } from 'react';
import { updateCanvasPositions as apiUpdateCanvasPositions, CanvasPositionUpdate } from '@/services/api';
import { POSITION_UPDATE_DEBOUNCE_MS, POSITION_UPDATE_RETRY_MS } from '../constants/canvasConstants';
import { shouldRetryPositionSync } from './positionSyncRetry';

export function useCanvasPositionSync() {
  const positionUpdateQueueRef = useRef<Map<string, CanvasPositionUpdate>>(new Map());
  const positionUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPositionUpdates = useCallback(async (retryDelayMs = POSITION_UPDATE_RETRY_MS) => {
    if (positionUpdateTimerRef.current) {
      clearTimeout(positionUpdateTimerRef.current);
      positionUpdateTimerRef.current = null;
    }

    const pendingUpdates = Array.from(positionUpdateQueueRef.current.values());
    if (pendingUpdates.length === 0) {
      return;
    }

    positionUpdateQueueRef.current.clear();

    try {
      // Cookies are sent automatically by axios
      await apiUpdateCanvasPositions(pendingUpdates);
    } catch (error) {
      console.error('Failed to update canvas positions:', error);

      if (shouldRetryPositionSync(error)) {
        pendingUpdates.forEach(update => {
          positionUpdateQueueRef.current.set(`${update.type}:${update.id}`, update);
        });
        positionUpdateTimerRef.current = setTimeout(() => {
          void flushPositionUpdates(retryDelayMs);
        }, retryDelayMs);
      }
    }
  }, []);

  const enqueuePositionUpdate = useCallback((update: CanvasPositionUpdate) => {
    positionUpdateQueueRef.current.set(`${update.type}:${update.id}`, update);

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
