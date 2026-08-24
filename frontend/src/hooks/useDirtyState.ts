import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseDirtyStateOptions<T> {
  value: T;
  ready?: boolean;
  resetKey?: string | number;
  serialize?: (value: T) => string;
}

const serializeDefault = <T,>(value: T) => JSON.stringify(value);

export function useDirtyState<T>({
  value,
  ready = true,
  resetKey = 'default',
  serialize = serializeDefault,
}: UseDirtyStateOptions<T>) {
  const fingerprint = useMemo(() => serialize(value), [serialize, value]);
  const fingerprintRef = useRef(fingerprint);
  const [baseline, setBaseline] = useState<string | null>(null);
  fingerprintRef.current = fingerprint;

  useEffect(() => {
    setBaseline(null);
  }, [resetKey]);

  useEffect(() => {
    if (ready && baseline === null) setBaseline(fingerprint);
  }, [baseline, fingerprint, ready]);

  const markClean = useCallback((nextValue?: T) => {
    setBaseline(nextValue === undefined ? fingerprintRef.current : serialize(nextValue));
  }, [serialize]);

  return {
    isDirty: ready && baseline !== null && fingerprint !== baseline,
    markClean,
  };
}
