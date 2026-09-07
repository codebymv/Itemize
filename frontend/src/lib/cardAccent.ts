import React, { createContext, createElement, useContext, useMemo } from 'react';
import { UI_COLORS } from '@/constants/ui';
import { THEME_COLORS, THEME_PALETTE, readAppliedThemeColor } from '@/lib/themeColor';

/**
 * A card's accent is its own colour: the dot, the progress bar, the client
 * chip, the sparkle, the primary action inside it. Brand blue is only the
 * default a card starts with, never a fixed value the components hard-code.
 * A frame sets the accent for its header, and pushes its colour onto the
 * cards inside it; each card then owns its own accent again.
 */
export const DEFAULT_CARD_ACCENT = UI_COLORS.defaultCardAccent;

/** What a new card starts with today: the current theme's 500 step. */
export const defaultCardAccent = (): string => THEME_PALETTE[readAppliedThemeColor()][500];

const THEME_DEFAULTS = new Set(THEME_COLORS.map(color => THEME_PALETTE[color][500].toUpperCase()));

export interface CardAccent {
  /** The card's colour, always a #RRGGBB string. */
  color: string;
  /** Text colour that reads on a surface filled with `color`. */
  contrast: string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance for a hex colour; null when the string is not one. */
export const luminanceOf = (color: string): number | null => {
  const hex = color.trim();
  if (!HEX.test(hex)) return null;
  const raw = hex.length === 4
    ? hex.slice(1).split('').map((part) => part + part).join('')
    : hex.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** White on dark accents, near-black on pale ones (a yellow note, a pastel category). */
export const contrastTextFor = (color: string): string => {
  const luminance = luminanceOf(color);
  if (luminance === null) return '#ffffff';
  return luminance > 0.45 ? '#111827' : '#ffffff';
};

export const normalizeAccent = (color: string | null | undefined): string =>
  color && HEX.test(color.trim()) ? color.trim().toUpperCase() : defaultCardAccent().toUpperCase();

/**
 * True while a card still wears the colour it was created with: any theme's
 * default, so a card made under blue still counts as unpainted on purple.
 */
export const isDefaultAccent = (color: string | null | undefined): boolean =>
  !color || THEME_DEFAULTS.has(normalizeAccent(color));

export const accentFor = (color: string | null | undefined): CardAccent => {
  const normalized = normalizeAccent(color);
  return { color: normalized, contrast: contrastTextFor(normalized) };
};

const CardAccentContext = createContext<CardAccent | null>(null);

export const CardAccentProvider: React.FC<{ color: string | null | undefined; children: React.ReactNode }> = ({
  color,
  children,
}) => {
  const value = useMemo(() => accentFor(color), [color]);
  return createElement(CardAccentContext.Provider, { value }, children);
};

export const useCardAccent = (): CardAccent => {
  const accent = useContext(CardAccentContext);
  return useMemo(() => accent ?? accentFor(defaultCardAccent()), [accent]);
};

/** Inline styles for the two ways an accent shows: as a filled surface, or as ink. */
export const accentFill = (accent: CardAccent): React.CSSProperties => ({
  backgroundColor: accent.color,
  color: accent.contrast,
  borderColor: accent.color,
});

export const accentInk = (accent: CardAccent): React.CSSProperties => ({ color: accent.color });
