/**
 * Status classes keyed by raw status string, for the client-profile surfaces.
 *
 * Like `lib/badge-utils`, this is a lookup into the one palette contract in
 * `lib/statusVisuals` rather than a second set of colors. Prefer `defineStatus`
 * for new work; it carries the label and icon alongside the theme.
 */
import { STATUS_THEME_CLASSES } from '@/lib/statusVisuals'
import type { StatTheme } from '@/lib/statusVisuals'

const badgeClass = (theme: StatTheme): string => STATUS_THEME_CLASSES[theme].badgeClass

const STATUS_THEMES = {
  // Itemize-owned live/working states
  active: 'blue',
  draft: 'blue',
  info: 'blue',
  // Successful outcomes
  completed: 'green',
  paid: 'green',
  accepted: 'green',
  succeeded: 'green',
  won: 'green',
  published: 'green',
  confirmed: 'green',
  // Parked or transitional states
  pending: 'orange',
  in_progress: 'orange',
  processing: 'orange',
  sent: 'orange',
  viewed: 'orange',
  partial: 'orange',
  inactive: 'orange',
  paused: 'orange',
  // Error states
  cancelled: 'red',
  failed: 'red',
  declined: 'red',
  expired: 'red',
  overdue: 'red',
  archived: 'red',
  // Neutral and historical states
  refunded: 'gray',
  neutral: 'gray',
} as const satisfies Record<string, StatTheme>

export const semanticColors = {
  status: Object.fromEntries(
    Object.entries(STATUS_THEMES).map(([status, theme]) => [status, badgeClass(theme)]),
  ) as Record<keyof typeof STATUS_THEMES, string>,
} as const

export type StatusType = keyof typeof STATUS_THEMES

export function getStatusColor(status: StatusType) {
  return semanticColors.status[status]
}
