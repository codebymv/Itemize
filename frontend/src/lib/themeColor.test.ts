import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_COLOR,
  THEME_COLORS,
  THEME_COLOR_ATTRIBUTE,
  THEME_COLOR_STORAGE_KEY,
  THEME_PALETTE,
  applyThemeColor,
  isThemeColor,
  normalizeThemeColor,
  readAppliedThemeColor,
  readStoredThemeColor,
} from './themeColor';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

describe('themeColor', () => {
  it('admits only the three product hues, never a status colour', () => {
    expect(THEME_COLORS).toEqual(['blue', 'purple', 'pink']);
    expect(isThemeColor('purple')).toBe(true);
    for (const status of ['green', 'red', 'amber', 'orange', 'yellow', 'gray', '', null, 7]) {
      expect(isThemeColor(status)).toBe(false);
      expect(normalizeThemeColor(status)).toBe(DEFAULT_THEME_COLOR);
    }
  });

  it('keeps blue as the palette the app shipped with', () => {
    expect(THEME_PALETTE.blue[500]).toBe('#3B82F6');
    expect(THEME_PALETTE.blue[600]).toBe('#2563EB');
    expect(THEME_PALETTE.blue[400]).toBe('#60A5FA');
  });

  it('stamps a non-default theme on the root and mirrors it to storage', () => {
    const root = document.createElement('html');
    const storage = memoryStorage();
    applyThemeColor('pink', root, storage);
    expect(root.getAttribute(THEME_COLOR_ATTRIBUTE)).toBe('pink');
    expect(storage.getItem(THEME_COLOR_STORAGE_KEY)).toBe('pink');
    expect(readAppliedThemeColor(root)).toBe('pink');
    expect(readStoredThemeColor(storage)).toBe('pink');
  });

  it('clears both when the theme returns to blue, so a fresh account is untouched', () => {
    const root = document.createElement('html');
    const storage = memoryStorage();
    applyThemeColor('purple', root, storage);
    applyThemeColor('blue', root, storage);
    expect(root.hasAttribute(THEME_COLOR_ATTRIBUTE)).toBe(false);
    expect(storage.getItem(THEME_COLOR_STORAGE_KEY)).toBeNull();
    expect(readAppliedThemeColor(root)).toBe('blue');
    expect(readStoredThemeColor(storage)).toBeNull();
  });

  it('survives storage that throws', () => {
    const root = document.createElement('html');
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => applyThemeColor('purple', root, broken)).not.toThrow();
    expect(root.getAttribute(THEME_COLOR_ATTRIBUTE)).toBe('purple');
    expect(readStoredThemeColor(broken)).toBeNull();
  });
});
