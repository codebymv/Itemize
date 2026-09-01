import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyedSingleFlightAction, useSingleFlightAction } from './useSingleFlightAction';

describe('useSingleFlightAction', () => {
  it('starts only one action before the pending state can rerender', async () => {
    let resolveAction: (() => void) | undefined;
    const action = vi.fn(() => new Promise<void>((resolve) => {
      resolveAction = resolve;
    }));
    const { result } = renderHook(() => useSingleFlightAction());

    let first: Promise<void | undefined>;
    let second: Promise<void | undefined>;
    act(() => {
      first = result.current.run(action);
      second = result.current.run(action);
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await expect(second!).resolves.toBeUndefined();

    await act(async () => {
      resolveAction?.();
      await first!;
    });
    expect(result.current.pending).toBe(false);
  });

  it('guards dismissal until the action settles', async () => {
    let resolveAction: (() => void) | undefined;
    const dismiss = vi.fn();
    const { result } = renderHook(() => useSingleFlightAction());

    let attempt: Promise<void | undefined>;
    act(() => {
      attempt = result.current.run(() => new Promise<void>((resolve) => {
        resolveAction = resolve;
      }));
      result.current.dismissIfIdle(dismiss);
    });
    expect(dismiss).not.toHaveBeenCalled();

    await act(async () => {
      resolveAction?.();
      await attempt!;
    });
    act(() => result.current.dismissIfIdle(dismiss));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('useKeyedSingleFlightAction', () => {
  it('rejects an immediate duplicate for one resource while allowing another resource', async () => {
    const resolvers = new Map<number, () => void>();
    const action = vi.fn((key: number) => new Promise<void>((resolve) => {
      resolvers.set(key, resolve);
    }));
    const { result } = renderHook(() => useKeyedSingleFlightAction<number>());

    let first: Promise<void | undefined>;
    let duplicate: Promise<void | undefined>;
    let other: Promise<void | undefined>;
    act(() => {
      first = result.current.run(1, () => action(1));
      duplicate = result.current.run(1, () => action(1));
      other = result.current.run(2, () => action(2));
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(result.current.pendingKeys).toEqual(new Set([1, 2]));
    expect(result.current.isPending(1)).toBe(true);
    await expect(duplicate!).resolves.toBeUndefined();

    await act(async () => {
      resolvers.get(1)?.();
      resolvers.get(2)?.();
      await Promise.all([first!, other!]);
    });
    expect(result.current.pendingKeys.size).toBe(0);
  });
});
