import { useCallback, useEffect, useRef, useState } from 'react';

import type { SaveState } from '@/components/ui/save-status';

interface UseAutosaveOptions<T> {
  value: T;
  savedValue: T;
  onSave: (value: T) => Promise<void>;
  enabled?: boolean;
  delay?: number;
  isEqual?: (left: T, right: T) => boolean;
}

export function useAutosave<T>({
  value,
  savedValue,
  onSave,
  enabled = true,
  delay = 1000,
  isEqual = Object.is,
}: UseAutosaveOptions<T>) {
  const [state, setState] = useState<SaveState>('idle');
  const valueRef = useRef(value);
  const savedValueRef = useRef(savedValue);
  const onSaveRef = useRef(onSave);
  const isEqualRef = useRef(isEqual);
  const pendingRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  valueRef.current = value;
  onSaveRef.current = onSave;
  isEqualRef.current = isEqual;

  const clearScheduledSave = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    clearScheduledSave();
    const pendingValue = valueRef.current;
    if (isEqualRef.current(pendingValue, savedValueRef.current)) {
      pendingRef.current = false;
      if (mountedRef.current) setState('idle');
      return true;
    }

    const request = (async () => {
      let succeeded = false;
      if (mountedRef.current) setState('saving');
      try {
        await onSaveRef.current(pendingValue);
        succeeded = true;
        savedValueRef.current = pendingValue;

        const changedDuringSave = !isEqualRef.current(valueRef.current, pendingValue);
        pendingRef.current = changedDuringSave;
        if (mountedRef.current) {
          setState(changedDuringSave ? 'dirty' : 'saved');
          if (!changedDuringSave) {
            if (savedStatusTimeoutRef.current) clearTimeout(savedStatusTimeoutRef.current);
            savedStatusTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && !pendingRef.current) setState('idle');
            }, 1600);
          }
        }
        return true;
      } catch {
        pendingRef.current = true;
        if (mountedRef.current) setState('error');
        return false;
      } finally {
        inFlightRef.current = null;
        if (
          succeeded
          && mountedRef.current
          && pendingRef.current
          && !isEqualRef.current(valueRef.current, savedValueRef.current)
        ) {
          queueMicrotask(() => { void flushRef.current(); });
        }
      }
    })();
    inFlightRef.current = request;
    return request;
  }, [clearScheduledSave]);
  flushRef.current = flush;

  useEffect(() => {
    if (pendingRef.current) return;
    savedValueRef.current = savedValue;
  }, [savedValue]);

  useEffect(() => {
    clearScheduledSave();
    if (!enabled || isEqualRef.current(value, savedValueRef.current)) {
      if (!pendingRef.current) setState((current) => current === 'dirty' ? 'idle' : current);
      return;
    }

    pendingRef.current = true;
    setState((current) => current === 'saving' ? current : 'dirty');
    timeoutRef.current = setTimeout(() => {
      void flush();
    }, delay);

    return clearScheduledSave;
  }, [clearScheduledSave, delay, enabled, flush, value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearScheduledSave();
      if (savedStatusTimeoutRef.current) clearTimeout(savedStatusTimeoutRef.current);
      if (!inFlightRef.current && pendingRef.current && !isEqualRef.current(valueRef.current, savedValueRef.current)) {
        void onSaveRef.current(valueRef.current).catch(() => undefined);
      }
    };
  }, [clearScheduledSave]);

  return {
    state,
    flush,
    retry: flush,
    hasUnsavedChanges: pendingRef.current || state === 'dirty' || state === 'error',
  };
}
