/**
 * Centralized badge color utilities for consistent status styling across the app.
 * 
 * Color semantics:
 * - Green: Success, completed, active, positive
 * - Orange: Warning, pending, in-progress, sent
 * - Sky/Blue: Info, draft, default
 * - Red: Error, cancelled, destructive, negative
 * - Purple: Special states (rarely used)
 * - Gray: Neutral, inactive, archived
 */

// Status badge color classes with dark mode support
export const STATUS_BADGE_CLASSES = {
  // Success states
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',

  // Warning/Pending states
  pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  in_progress: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  sent: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  scheduled: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  neutral: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',

  // Info/Draft states
  draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',

  // Error/Destructive states
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',

  // Inactive/Neutral states
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  paused: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
} as const;

export type StatusKey = keyof typeof STATUS_BADGE_CLASSES;

/**
 * Get badge classes for a given status string.
 * Falls back to gray for unknown statuses.
 */
export function getStatusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase().replace(/[- ]/g, '_') as StatusKey;
  return STATUS_BADGE_CLASSES[normalizedStatus] ?? 
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}

// Contact status badge classes
export const CONTACT_STATUS_CLASSES = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  inactive: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
} as const;

export type ContactStatusKey = keyof typeof CONTACT_STATUS_CLASSES;

export function getContactStatusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase() as ContactStatusKey;
  return CONTACT_STATUS_CLASSES[normalizedStatus] ?? '';
}

// Widget type badge classes (for reputation widgets)
export const WIDGET_TYPE_CLASSES = {
  carousel: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  grid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  list: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  floating: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
} as const;

export type WidgetTypeKey = keyof typeof WIDGET_TYPE_CLASSES;

export function getWidgetTypeBadgeClass(type: string): string {
  return WIDGET_TYPE_CLASSES[type as WidgetTypeKey] ?? 
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}

// Sentiment badge classes (for reviews)
export const SENTIMENT_CLASSES = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  neutral: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
} as const;

export type SentimentKey = keyof typeof SENTIMENT_CLASSES;

export function getSentimentBadgeClass(sentiment: string): string {
  return SENTIMENT_CLASSES[sentiment as SentimentKey] ?? 
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
