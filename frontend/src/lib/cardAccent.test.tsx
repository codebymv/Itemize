import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import {
  CardAccentProvider,
  DEFAULT_CARD_ACCENT,
  accentFor,
  contrastTextFor,
  isDefaultAccent,
  luminanceOf,
  useCardAccent,
} from './cardAccent';

describe('cardAccent', () => {
  it('measures luminance and picks readable text', () => {
    expect(luminanceOf('#000000')).toBe(0);
    expect(luminanceOf('#ffffff')).toBeCloseTo(1, 5);
    expect(luminanceOf('#fff')).toBeCloseTo(1, 5);
    expect(luminanceOf('not a colour')).toBeNull();
    expect(contrastTextFor('#3B82F6')).toBe('#ffffff');
    expect(contrastTextFor('#FFFFE0')).toBe('#111827');
    expect(contrastTextFor('#10B981')).toBe('#ffffff');
  });

  it('treats brand blue, empty, and junk as the default accent', () => {
    expect(isDefaultAccent(DEFAULT_CARD_ACCENT)).toBe(true);
    expect(isDefaultAccent('#3b82f6')).toBe(true);
    expect(isDefaultAccent(null)).toBe(true);
    expect(isDefaultAccent('#10B981')).toBe(false);
    expect(accentFor('garbage')).toEqual({ color: DEFAULT_CARD_ACCENT, contrast: '#ffffff' });
  });

  it('gives components the nearest card colour, defaulting to brand blue', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CardAccentProvider color="#FFFFE0">{children}</CardAccentProvider>
    );
    expect(renderHook(() => useCardAccent(), { wrapper }).result.current).toEqual({ color: '#FFFFE0', contrast: '#111827' });
    expect(renderHook(() => useCardAccent()).result.current.color).toBe(DEFAULT_CARD_ACCENT);
  });
});
