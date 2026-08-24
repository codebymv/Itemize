import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReduceMotionPreference,
  getStartPagePreference,
  preferredHomePath,
  setReduceMotionPreference,
  setStartPagePreference,
} from './userPreferences';

describe('user preferences', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.mocked(localStorage.getItem).mockImplementation((key) => values.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      values.set(key, value);
    });
    vi.mocked(localStorage.removeItem).mockImplementation((key) => {
      values.delete(key);
    });
    document.documentElement.classList.remove('reduce-motion');
  });

  it('uses plan-aware defaults for the automatic start page', () => {
    expect(getStartPagePreference()).toBe('automatic');
    expect(preferredHomePath(false)).toBe('/canvas');
    expect(preferredHomePath(true)).toBe('/dashboard');
  });

  it('honors an explicit canvas start page for every plan', () => {
    setStartPagePreference('canvas');
    expect(preferredHomePath(false)).toBe('/canvas');
    expect(preferredHomePath(true)).toBe('/canvas');
  });

  it('falls back to canvas when dashboard is unavailable', () => {
    setStartPagePreference('dashboard');
    expect(preferredHomePath(false)).toBe('/canvas');
    expect(preferredHomePath(true)).toBe('/dashboard');
  });

  it('persists and applies reduced motion', () => {
    setReduceMotionPreference(true);
    expect(getReduceMotionPreference()).toBe(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);

    setReduceMotionPreference(false);
    expect(getReduceMotionPreference()).toBe(false);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });
});
