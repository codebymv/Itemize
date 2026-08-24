import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutosave } from './useAutosave';

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves through dirty, saving, and saved without discarding the pending value', async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ value, savedValue: 'saved', onSave, delay: 500 }),
      { initialProps: { value: 'saved' } },
    );

    rerender({ value: 'draft' });
    expect(result.current.state).toBe('dirty');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSave).toHaveBeenCalledWith('draft');
    expect(result.current.state).toBe('saving');

    await act(async () => resolveSave?.());
    expect(result.current.state).toBe('saved');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('keeps failed content retryable', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ value, savedValue: 'saved', onSave, delay: 500 }),
      { initialProps: { value: 'saved' } },
    );

    rerender({ value: 'draft' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.state).toBe('error');
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state).toBe('saved');
  });

  it('flushes a pending value when its editor unmounts', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(
      ({ value }) => useAutosave({ value, savedValue: 'saved', onSave, delay: 500 }),
      { initialProps: { value: 'saved' } },
    );

    rerender({ value: 'draft' });
    unmount();

    expect(onSave).toHaveBeenCalledWith('draft');
  });

  it('serializes a newer edit made while a save is in flight', async () => {
    let finishFirstSave: (() => void) | undefined;
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirstSave = resolve;
      }))
      .mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ value, savedValue: '', onSave, delay: 20 }),
      { initialProps: { value: 'first' } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(onSave).toHaveBeenCalledWith('first');

    rerender({ value: 'newest' });
    await act(async () => {
      finishFirstSave?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenNthCalledWith(2, 'newest');
    expect(result.current.state).toBe('saved');
  });
});
