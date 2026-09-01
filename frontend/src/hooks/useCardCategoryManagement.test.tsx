import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCardCategoryManagement } from './useCardCategoryManagement';

describe('useCardCategoryManagement', () => {
  it('serializes category mutations through one immediate lock', async () => {
    let resolveUpdate: (() => void) | undefined;
    const onUpdateCategory = vi.fn(() => new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    }));
    const onUpdateCategoryColor = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardCategoryManagement({
      onUpdateCategory,
      onUpdateCategoryColor,
    }));

    let first: Promise<void>;
    act(() => {
      first = result.current.handleEditCategory('Planning');
      void result.current.handleUpdateCategoryColor('Planning', '#3B82F6');
    });

    expect(onUpdateCategory).toHaveBeenCalledOnce();
    expect(onUpdateCategoryColor).not.toHaveBeenCalled();
    expect(result.current.isSavingCategory).toBe(true);

    await act(async () => {
      resolveUpdate?.();
      await first!;
    });
    expect(result.current.isSavingCategory).toBe(false);
  });
});
