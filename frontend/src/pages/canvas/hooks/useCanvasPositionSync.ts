import { useCallback, useRef, useEffect } from 'react';
import { updateCanvasPositions as apiUpdateCanvasPositions, CanvasPositionUpdate } from '@/services/api';
import { POSITION_UPDATE_DEBOUNCE_MS, POSITION_UPDATE_RETRY_MS } from '../constants/canvasConstants';

export function useCanvasPositionSync(token: string | null) {
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
      await apiUpdateCanvasPositions(pendingUpdates, token);
    } catch (error: any) {
      console.error('Failed to update canvas positions:', error);

      if (error?.response?.status === 429) {
        pendingUpdates.forEach(update => {
          positionUpdateQueueRef.current.set(`${update.type}:${update.id}`, update);
        });
        positionUpdateTimerRef.current = setTimeout(() => {
          void flushPositionUpdates(retryDelayMs);
        }, retryDelayMs);
      }
    }
  }, [token]);

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
    return () => {
      if (positionUpdateTimerRef.current) {
        clearTimeout(positionUpdateTimerRef.current);
      }
      if (positionUpdateQueueRef.current.size > 0) {
        void flushPositionUpdates();
      }
    };
  }, [flushPositionUpdates]);

  return { enqueuePositionUpdate };
}