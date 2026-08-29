import { format, isToday, isYesterday, isThisWeek } from 'date-fns'
import type { Activity } from '@/design-system/types/activity.types'

export function getLatestActivityGroupLabel(activities: Activity[]): string | null {
  if (activities.length === 0) return null

  const latestActivity = activities.reduce((latest, activity) =>
    new Date(activity.timestamp).getTime() > new Date(latest.timestamp).getTime()
      ? activity
      : latest
  )
  const date = new Date(latestActivity.timestamp)

  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisWeek(date)) return 'This Week'
  return format(date, 'MMM d, yyyy')
}
