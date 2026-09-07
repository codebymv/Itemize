/**
 * Theme colour: the product accent a user picks in preferences.
 *
 * Blue is the colour the app starts with, not the app's colour. Every
 * "theme" surface (primary buttons, chrome icons, links, rings, the favicon,
 * the colour a new card starts with) reads the tokens that
 * `applyThemeColor` switches on `<html data-theme-color>`. Two things never
 * follow it: brand surfaces other people see (see
 * `design-system/brand-surfaces.ts`) and status colours (`lib/statusVisuals`).
 *
 * The palette is deliberately three hues, none in the status family, so a
 * theme can never be confused with red, green, or amber. Adding a hue is a
 * code change reviewed against `statusVisuals`.
 */
export const THEME_COLORS = ['blue', 'purple', 'pink'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export const DEFAULT_THEME_COLOR: ThemeColor = 'blue';

/** localStorage key mirrored by the boot script in index.html. */
export const THEME_COLOR_STORAGE_KEY = 'itemize:theme-color';

export const THEME_COLOR_ATTRIBUTE = 'data-theme-color';

interface ThemeSwatch {
  /** Tailwind 100 step: soft tint on light surfaces. */
  100: string;
  /** Tailwind 400 step: ink on dark surfaces. */
  400: string;
  /** Tailwind 500 step: what a new card starts with. */
  500: string;
  /** Tailwind 600 step: fills and ink on light surfaces. */
  600: string;
  /** Tailwind 700 step: hover on fills. */
  700: string;
}

/** Hex values per theme, straight from Tailwind's scale so contrast matches blue's. */
export const THEME_PALETTE: Record<ThemeColor, ThemeSwatch> = {
  blue: { 100: '#DBEAFE', 400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8' },
  purple: { 100: '#F3E8FF', 400: '#C084FC', 500: '#A855F7', 600: '#9333EA', 700: '#7E22CE' },
  pink: { 100: '#FCE7F3', 400: '#F472B6', 500: '#EC4899', 600: '#DB2777', 700: '#BE185D' },
};

export const THEME_COLOR_LABELS: Record<ThemeColor, string> = {
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
};

export const isThemeColor = (value: unknown): value is ThemeColor =>
  typeof value === 'string' && (THEME_COLORS as readonly string[]).includes(value);

/** Coerce anything (server field, storage, query param) to a theme colour. */
export const normalizeThemeColor = (value: unknown): ThemeColor =>
  isThemeColor(value) ? value : DEFAULT_THEME_COLOR;

const documentRoot = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.documentElement;

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The theme currently stamped on the document, or the default. */
export function readAppliedThemeColor(root: HTMLElement | null = documentRoot()): ThemeColor {
  return normalizeThemeColor(root?.getAttribute(THEME_COLOR_ATTRIBUTE));
}

/** The theme the boot script will use on the next load, if one is mirrored. */
export function readStoredThemeColor(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ThemeColor | null {
  try {
    const stored = storage?.getItem(THEME_COLOR_STORAGE_KEY);
    return isThemeColor(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Stamp the theme on `<html>` and mirror it for the boot script. Blue clears
 * the attribute so the base tokens apply and a fresh account looks exactly
 * as it did before themes existed.
 */
export function applyThemeColor(
  color: ThemeColor,
  root: HTMLElement | null = documentRoot(),
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage(),
): void {
  if (root) {
    if (color === DEFAULT_THEME_COLOR) root.removeAttribute(THEME_COLOR_ATTRIBUTE);
    else root.setAttribute(THEME_COLOR_ATTRIBUTE, color);
  }
  try {
    if (color === DEFAULT_THEME_COLOR) storage?.removeItem(THEME_COLOR_STORAGE_KEY);
    else storage?.setItem(THEME_COLOR_STORAGE_KEY, color);
  } catch {
    /* private mode or blocked storage: the attribute alone carries this session */
  }
}
