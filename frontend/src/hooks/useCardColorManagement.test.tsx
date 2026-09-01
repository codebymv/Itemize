import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCardColorManagement } from './useCardColorManagement';

describe('useCardColorManagement', () => {
  it('admits only one color save before pending state renders', async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const { result } = renderHook(() => useCardColorManagement({ onSave }));

    let first: Promise<void>;
    act(() => {
      first = result.current.saveColor('#3B82F6');
      void result.current.saveColor('#EF4444');
    });

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('#3B82F6');
    expect(result.current.isSavingColor).toBe(true);

    await act(async () => {
      resolveSave?.();
      await first!;
    });
    expect(result.current.isSavingColor).toBe(false);
  });
});
