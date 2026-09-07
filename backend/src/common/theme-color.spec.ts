import { DEFAULT_THEME_COLOR, THEME_COLORS, isThemeColor, normalizeThemeColor } from './theme-color';

describe('theme colour palette', () => {
  it('admits the three product hues and nothing from the status family', () => {
    expect(THEME_COLORS).toEqual(['blue', 'purple', 'pink']);
    expect(isThemeColor('pink')).toBe(true);
    for (const value of ['green', 'red', 'amber', 'orange', 'yellow', 'gray', 'BLUE', '', null, undefined, 3]) {
      expect(isThemeColor(value)).toBe(false);
      expect(normalizeThemeColor(value)).toBe(DEFAULT_THEME_COLOR);
    }
  });
});
