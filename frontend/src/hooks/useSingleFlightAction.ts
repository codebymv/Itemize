import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Owns the browser lifecycle for one user-initiated async action.
 *
 * The ref closes the gap before React can render a disabled control, while the
 * state drives visible pending feedback. This is deliberately separate from
 * server idempotency: callers still need an idempotency key when repeating the
 * business effect must be safe after an ambiguous response.
 */
export function useSingleFlightAction() {
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined;

    inFlightRef.current = true;
    setPending(true);
    try {
      return await action();
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }, []);

  const dismissIfIdle = useCallback((dismiss: () => void) => {
    if (!inFlightRef.current) dismiss();
  }, []);

  return { pending, run, dismissIfIdle };
}

/**
 * Owns independent async actions keyed by the resource they mutate.
 *
 * This is intended for lists and boards where actions on different rows may
 * proceed together, but two actions targeting the same resource must not race.
 */
export function useKeyedSingleFlightAction<Key extends string | number>() {
  const inFlightRef = useRef(new Set<Key>());
  const mountedRef = useRef(true);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<Key>>(() => new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(key: Key, action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current.has(key)) return undefined;

    inFlightRef.current.add(key);
    setPendingKeys(new Set(inFlightRef.current));
    try {
      return await action();
    } finally {
      inFlightRef.current.delete(key);
      if (mountedRef.current) setPendingKeys(new Set(inFlightRef.current));
    }
  }, []);

  const isPending = useCallback((key: Key) => inFlightRef.current.has(key), []);

  const dismissIfIdle = useCallback((key: Key, dismiss: () => void) => {
    if (!inFlightRef.current.has(key)) dismiss();
  }, []);

  return {
    pendingKeys,
    anyPending: pendingKeys.size > 0,
    isPending,
    run,
    dismissIfIdle,
  };
}
