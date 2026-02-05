import { useMemo } from 'react';

export type StatTheme = 'green' | 'orange' | 'blue' | 'red' | 'gray';

// Export class maps for direct access without hook
export const STAT_BADGE_CLASSES: Record<StatTheme, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

export const STAT_ICON_BG_CLASSES: Record<StatTheme, string> = {
  green: 'bg-green-100 dark:bg-green-900',
  orange: 'bg-orange-100 dark:bg-orange-900',
  blue: 'bg-sky-100 dark:bg-sky-900',
  red: 'bg-red-100 dark:bg-red-900',
  gray: 'bg-gray-100 dark:bg-gray-800',
};

export const STAT_VALUE_CLASSES: Record<StatTheme, string> = {
  green: 'text-green-600',
  orange: 'text-orange-600',
  blue: 'text-sky-600',
  red: 'text-red-600',
  gray: 'text-gray-600',
};

export const STAT_ICON_CLASSES: Record<StatTheme, string> = {
  green: 'text-green-600 dark:text-green-400',
  orange: 'text-orange-600 dark:text-orange-400',
  blue: 'text-sky-600 dark:text-sky-400',
  red: 'text-red-600 dark:text-red-400',
  gray: 'text-gray-400 dark:text-gray-500',
};

// Helper functions for direct access
export const getStatBadgeClass = (theme: StatTheme): string => 
  STAT_BADGE_CLASSES[theme] ?? STAT_BADGE_CLASSES.gray;

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
      badgeClass: STAT_BADGE_CLASSES[resolvedTheme],
      iconBgClass: STAT_ICON_BG_CLASSES[resolvedTheme],
      valueClass: STAT_VALUE_CLASSES[resolvedTheme],
      iconClass: STAT_ICON_CLASSES[resolvedTheme],
    };
  }, [theme]);
};
