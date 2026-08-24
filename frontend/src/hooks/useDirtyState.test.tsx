import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDirtyState } from './useDirtyState';

describe('useDirtyState', () => {
  it('establishes a baseline only after data is ready', () => {
    const { result, rerender } = renderHook(
      ({ value, ready }) => useDirtyState({ value, ready }),
      { initialProps: { value: { name: '' }, ready: false } },
    );

    rerender({ value: { name: 'Loaded' }, ready: true });
    expect(result.current.isDirty).toBe(false);

    rerender({ value: { name: 'Edited' }, ready: true });
    expect(result.current.isDirty).toBe(true);
  });

  it('can mark the current editor value as persisted', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDirtyState({ value }),
      { initialProps: { value: { name: 'Original' } } },
    );

    rerender({ value: { name: 'Edited' } });
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.markClean());
    expect(result.current.isDirty).toBe(false);
  });
});
