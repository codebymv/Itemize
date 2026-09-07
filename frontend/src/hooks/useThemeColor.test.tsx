import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeColor } from '@/lib/themeColor';
import { useThemeColor } from './useThemeColor';

describe('useThemeColor', () => {
  afterEach(() => {
    applyThemeColor('blue');
  });

  it('reports the theme stamped on the document and follows changes to it', async () => {
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe('blue');

    await act(async () => {
      applyThemeColor('purple');
      await Promise.resolve();
    });
    expect(result.current).toBe('purple');

    await act(async () => {
      document.documentElement.setAttribute('data-theme-color', 'pink');
      await Promise.resolve();
    });
    expect(result.current).toBe('pink');
  });
});
