/**
 * Badge classes for pages that key styling off a raw status string rather than
 * a declared `StatusVisual`.
 *
 * These are lookups into the one palette contract in `./statusVisuals`, not a
 * second set of colors: every entry names a `StatusTheme`, so the semantics
 * documented there hold here too. Prefer `defineStatus` for new work — it
 * carries the label and icon alongside the theme. Reach for this only when all
 * you have is a string.
 */
import { STATUS_THEME_CLASSES } from './statusVisuals';
import type { StatTheme } from './statusVisuals';

const badgeClass = (theme: StatTheme): string => STATUS_THEME_CLASSES[theme].badgeClass;

const NEUTRAL_BADGE_CLASS = badgeClass('gray');

const STATUS_THEMES = {
  // Successful outcomes
  completed: 'green',
  success: 'green',
  paid: 'green',
  accepted: 'green',
  confirmed: 'green',
  published: 'green',
  positive: 'green',

  // Parked or transitional states
  pending: 'orange',
  in_progress: 'orange',
  processing: 'orange',
  sent: 'orange',
  viewed: 'orange',
  partial: 'orange',
  inactive: 'orange',
  paused: 'orange',
  scheduled: 'orange',

  // Itemize-owned active, draft, and live working states
  active: 'blue',
  draft: 'blue',
  info: 'blue',
  new: 'blue',

  // Error, cancelled, destructive, negative
  cancelled: 'red',
  declined: 'red',
  failed: 'red',
  error: 'red',
  expired: 'red',
  overdue: 'red',
  archived: 'red',
  negative: 'red',

  // Neutral and historical states
  refunded: 'gray',
  neutral: 'gray',
} as const satisfies Record<string, StatTheme>;

export type StatusKey = keyof typeof STATUS_THEMES;

export const STATUS_BADGE_CLASSES = Object.fromEntries(
  Object.entries(STATUS_THEMES).map(([status, theme]) => [status, badgeClass(theme)]),
) as Record<StatusKey, string>;

/** Badge classes for a status string. Unknown statuses read neutral. */
export function getStatusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase().replace(/[- ]/g, '_') as StatusKey;
  return STATUS_BADGE_CLASSES[normalizedStatus] ?? NEUTRAL_BADGE_CLASS;
}

// Contact status badge classes
export const CONTACT_STATUS_CLASSES = {
  active: STATUS_BADGE_CLASSES.active,
  inactive: STATUS_BADGE_CLASSES.inactive,
  archived: STATUS_BADGE_CLASSES.archived,
} as const;

export type ContactStatusKey = keyof typeof CONTACT_STATUS_CLASSES;

export function getContactStatusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase() as ContactStatusKey;
  return CONTACT_STATUS_CLASSES[normalizedStatus] ?? '';
}

/**
 * Reputation widget types are a categorical scale, not a status: the colors
 * separate one type from the next and carry no success/warning meaning. They
 * deliberately reach past the five status themes for that reason.
 */
export const WIDGET_TYPE_CLASSES = {
  carousel: badgeClass('blue'),
  grid: badgeClass('green'),
  list: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  badge: badgeClass('orange'),
  floating: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
} as const;

export type WidgetTypeKey = keyof typeof WIDGET_TYPE_CLASSES;

export function getWidgetTypeBadgeClass(type: string): string {
  return WIDGET_TYPE_CLASSES[type as WidgetTypeKey] ?? NEUTRAL_BADGE_CLASS;
}

// Sentiment badge classes (for reviews)
export const SENTIMENT_CLASSES = {
  positive: STATUS_BADGE_CLASSES.positive,
  neutral: STATUS_BADGE_CLASSES.pending,
  negative: STATUS_BADGE_CLASSES.negative,
} as const;

export type SentimentKey = keyof typeof SENTIMENT_CLASSES;

export function getSentimentBadgeClass(sentiment: string): string {
  return SENTIMENT_CLASSES[sentiment as SentimentKey] ?? NEUTRAL_BADGE_CLASS;
}
