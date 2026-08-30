import { useMemo } from 'react';
import { STATUS_THEME_CLASSES, type StatTheme } from '@/lib/statusVisuals';

export type { StatTheme };

const byTheme = <T,>(pick: (theme: StatTheme) => T): Record<StatTheme, T> =>
  Object.fromEntries(
    (Object.keys(STATUS_THEME_CLASSES) as StatTheme[]).map(theme => [theme, pick(theme)]),
  ) as Record<StatTheme, T>;

// Badge and icon-disc classes are the shared palette verbatim, so a status pill
// and the stat card counting that status always agree.
export const STAT_BADGE_CLASSES = byTheme(theme => STATUS_THEME_CLASSES[theme].badgeClass);

export const STAT_ICON_BG_CLASSES = byTheme(theme => STATUS_THEME_CLASSES[theme].iconBackgroundClass);

export const STAT_ICON_CLASSES = byTheme(theme => STATUS_THEME_CLASSES[theme].iconClass);

/**
 * Stat values are the one place that departs from the palette: a large numeral
 * needs more weight than a 16px icon, so gray reads at 600/400 rather than the
 * icon's 500/400. Every other theme matches its icon class.
 */
export const STAT_VALUE_CLASSES: Record<StatTheme, string> = {
  ...byTheme(theme => STATUS_THEME_CLASSES[theme].iconClass),
  gray: 'text-gray-600 dark:text-gray-400',
};

export const getStatIconBgClass = (theme: StatTheme): string =>
  STAT_ICON_BG_CLASSES[theme] ?? STAT_ICON_BG_CLASSES.gray;

export const getStatValueClass = (theme: StatTheme): string =>
  STAT_VALUE_CLASSES[theme] ?? STAT_VALUE_CLASSES.gray;

export const getStatIconClass = (theme: StatTheme): string =>
  STAT_ICON_CLASSES[theme] ?? STAT_ICON_CLASSES.gray;

export const useStatStyles = (theme: StatTheme) => {
  return useMemo(() => {
    const resolvedTheme = theme ?? 'gray';
    return {
      iconBgClass: STAT_ICON_BG_CLASSES[resolvedTheme],
      valueClass: STAT_VALUE_CLASSES[resolvedTheme],
      iconClass: STAT_ICON_CLASSES[resolvedTheme],
    };
  }, [theme]);
};
