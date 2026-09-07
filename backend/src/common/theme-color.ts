/**
 * The theme colours a user may pick. Mirrors `frontend/src/lib/themeColor.ts`:
 * three product hues, none in the status family (red, green, amber), so a
 * theme can never read as a state. Adding a hue is a change on both sides.
 */
export const THEME_COLORS = ['blue', 'purple', 'pink'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export const DEFAULT_THEME_COLOR: ThemeColor = 'blue';

export const isThemeColor = (value: unknown): value is ThemeColor =>
  typeof value === 'string' && (THEME_COLORS as readonly string[]).includes(value);

/** Rows written before the column existed, or by hand, still read as a valid theme. */
export const normalizeThemeColor = (value: unknown): ThemeColor =>
  isThemeColor(value) ? value : DEFAULT_THEME_COLOR;
