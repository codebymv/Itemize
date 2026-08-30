import type { LucideIcon } from 'lucide-react';
import { Clock } from 'lucide-react';

/**
 * The status palette. Five themes carry the app's whole status grammar:
 * blue = Itemize-owned draft/active/working, orange = parked or in flight,
 * green = successful outcome, red = failed or destructive, gray = neutral.
 *
 * This module is the single definition. Nothing else may declare these
 * classes; `hooks/useStatStyles` and `lib/badge-utils` read from here.
 */
export type StatTheme = 'green' | 'orange' | 'blue' | 'red' | 'gray';

export interface StatusThemeClasses {
  iconBackgroundClass: string;
  iconClass: string;
  badgeClass: string;
}

export interface StatusVisual extends StatusThemeClasses {
  label: string;
  theme: StatTheme;
  icon: LucideIcon;
}

export const STATUS_THEME_CLASSES: Record<StatTheme, StatusThemeClasses> = {
  blue: {
    iconBackgroundClass: 'bg-blue-100 dark:bg-blue-900',
    iconClass: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  },
  orange: {
    iconBackgroundClass: 'bg-orange-100 dark:bg-orange-900',
    iconClass: 'text-orange-600 dark:text-orange-400',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  },
  green: {
    iconBackgroundClass: 'bg-green-100 dark:bg-green-900',
    iconClass: 'text-green-600 dark:text-green-400',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  },
  red: {
    iconBackgroundClass: 'bg-red-100 dark:bg-red-900',
    iconClass: 'text-red-600 dark:text-red-400',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  },
  gray: {
    iconBackgroundClass: 'bg-gray-100 dark:bg-gray-800',
    iconClass: 'text-gray-500 dark:text-gray-400',
    badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  },
};

export const defineStatus = (
  label: string,
  theme: StatTheme,
  icon: LucideIcon,
): StatusVisual => ({
  label,
  theme,
  icon,
  ...STATUS_THEME_CLASSES[theme],
});

export function getUnknownStatusVisual(status: string): StatusVisual {
  return {
    ...defineStatus('Unknown', 'gray', Clock),
    label: status
      .toLowerCase()
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase()),
  };
}

/**
 * Narrows a StatusVisual to the label/class pair used by surfaces that render
 * a bare pill without an icon (list dialogs, compact pickers).
 */
export function toBadgeStatus(visual: StatusVisual): { label: string; className: string } {
  return { label: visual.label, className: visual.badgeClass };
}
