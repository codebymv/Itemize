import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useKeyedStableMutationKey,
  useStableMutationKey,
} from './useStableMutationKey';

describe('useStableMutationKey', () => {
  beforeEach(() => {
    let sequence = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `request-${++sequence}` });
  });

  it('reuses a key for an unchanged retry and rotates when the payload changes', () => {
    const { result } = renderHook(() => useStableMutationKey('delivery'));

    expect(result.current.keyFor('contact:4|body:hello')).toBe('request-1');
    expect(result.current.keyFor('contact:4|body:hello')).toBe('request-1');
    expect(result.current.keyFor('contact:4|body:updated')).toBe('request-2');
  });

  it('rotates after a confirmed attempt is reset', () => {
    const { result } = renderHook(() => useStableMutationKey('delivery'));

    expect(result.current.keyFor('same-payload')).toBe('request-1');
    act(() => result.current.reset());
    expect(result.current.keyFor('same-payload')).toBe('request-2');
  });

  it('rejects a concurrent handler and permits an unchanged retry after release', () => {
    const { result } = renderHook(() => useStableMutationKey('delivery'));

    expect(result.current.begin('same-payload')).toBe('request-1');
    expect(result.current.begin('same-payload')).toBeNull();
    act(() => result.current.release());
    expect(result.current.begin('same-payload')).toBe('request-1');
  });
});

describe('useKeyedStableMutationKey', () => {
  it('retains failed row attempts without blocking unrelated rows', () => {
    const { result } = renderHook(() =>
      useKeyedStableMutationKey<number>('duplicate-form'),
    );
    const first = result.current.begin(7, 'same');
    expect(first).toBeTruthy();
    expect(result.current.begin(7, 'same')).toBeNull();
    const other = result.current.begin(8, 'other');
    expect(other).toBeTruthy();
    expect(other).not.toBe(first);

    result.current.release(7);
    expect(result.current.begin(7, 'same')).toBe(first);
    result.current.reset(7);
    expect(result.current.begin(7, 'same')).not.toBe(first);
  });
});
