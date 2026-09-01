import { useCallback, useRef } from 'react';

const newMutationKey = (scope: string): string =>
  globalThis.crypto?.randomUUID?.()
  ?? `${scope}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Keeps one server idempotency key for an unchanged mutation attempt.
 *
 * A caller should reset after confirmed success or an explicit cancel. If a
 * request fails ambiguously, requesting the key again with the same signature
 * deliberately returns the same value so the action can be retried safely.
 */
export const useStableMutationKey = (scope: string) => {
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef(false);

  const keyFor = useCallback((signature: string): string => {
    if (attempt.current?.signature === signature) return attempt.current.key;
    const key = newMutationKey(scope);
    attempt.current = { signature, key };
    return key;
  }, [scope]);

  const reset = useCallback(() => {
    inFlight.current = false;
    attempt.current = null;
  }, []);

  const begin = useCallback((signature: string): string | null => {
    if (inFlight.current) return null;
    inFlight.current = true;
    return keyFor(signature);
  }, [keyFor]);

  const release = useCallback(() => {
    inFlight.current = false;
  }, []);

  return { begin, keyFor, release, reset };
};
