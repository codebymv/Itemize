import React from 'react'
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { semanticColors } from '@/design-system/design-tokens'
import type { Activity, ActivityType } from '@/design-system/types/activity.types'

import {
  Users,
  Receipt,
  FileSignature,
  Megaphone,
  Zap,
  CheckSquare,
  Calendar,
  TrendingUp,
  Activity,
  Sparkles,
} from 'lucide-react'

interface ActivityTimelineProps {
  activities: Activity[]
  loading?: boolean
  empty?: {
    title?: string
    description?: string
  }
  onSelectActivity?: (activity: Activity) => void
  className?: string
}

const itemTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  contact: Users,
  invoice: Receipt,
  signature: FileSignature,
  campaign: Megaphone,
  workflow: Sparkles,
  note: CheckSquare,
  list: CheckSquare,
  contract: FileSignature,
  booking: Calendar,
  deal: TrendingUp,
}

const activityTypeColors: Record<ActivityType, string> = {
  created: 'text-blue-600 dark:text-blue-400',
  updated: 'text-blue-600 dark:text-blue-400',
  deleted: 'text-red-600 dark:text-red-400',
  sent: 'text-blue-600 dark:text-blue-400',
  received: 'text-blue-600 dark:text-blue-400',
  signed: 'text-green-600 dark:text-green-400',
  paid: 'text-green-600 dark:text-green-400',
  viewed: 'text-gray-600 dark:text-gray-400',
  commented: 'text-blue-600 dark:text-blue-400',
  mentioned: 'text-blue-600 dark:text-blue-400',
  status_changed: 'text-orange-600 dark:text-orange-400',
  workflow_triggered: 'text-orange-600 dark:text-orange-400',
  scheduled: 'text-blue-600 dark:text-blue-400',
  completed: 'text-green-600 dark:text-green-400',
  published: 'text-blue-600 dark:text-blue-400',
  archived: 'text-gray-600 dark:text-gray-400',
  restored: 'text-green-600 dark:text-green-400',
  assigned: 'text-blue-600 dark:text-blue-400',
  tagged: 'text-orange-600 dark:text-orange-400',
}

function ActivityItem({
  activity,
  onSelect,
}: {
  activity: Activity
  onSelect?: (activity: Activity) => void
}) {
  const ItemIcon = itemTypeIcons[activity.itemType] || Users
  const typeColor = activityTypeColors[activity.type] || 'text-blue-600 dark:text-blue-400'
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })

  return (
    <Card
      className={cn(
        'p-4 transition-all',
        onSelect && 'cursor-pointer hover:shadow-md',
        'bg-muted/10'
      )}
      onClick={() => onSelect?.(activity)}
    >
      <div className="flex gap-4">
        <div className={cn('flex-shrink-0', typeColor)}>
          <ItemIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{activity.title}</span>
              {activity.target && (
                <>
                  <span className="text-muted-foreground text-sm">
                    {getActionVerb(activity.type)}
                  </span>
                  <a
                    href={activity.target.url}
                    className='text-sm hover:underline text-blue-600 dark:text-blue-400'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activity.target.name}
                  </a>
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {timeAgo}
            </span>
          </div>

          {activity.description && (
            <p className="text-sm text-muted-foreground mb-2">
              {activity.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

function ActivityTimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4 bg-muted/10">
          <div className="flex gap-4">
            <Skeleton className="h-5 w-5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function ActivityTimeline({
  activities,
  loading = false,
  empty,
  onSelectActivity,
  className,
}: ActivityTimelineProps) {
  if (loading) {
    return <ActivityTimelineSkeleton />
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Activity className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">{empty?.title || 'No activity yet'}</h3>
        <p className="text-sm text-muted-foreground">
          {empty?.description || 'Activity will appear here as you use Itemize'}
        </p>
      </Card>
    )
  }

  const groupedActivities = groupActivitiesByDate(activities)

  return (
    <div className={cn('space-y-6', className)}>
      {groupedActivities.map((group) => (
        <div key={group.date}>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background py-2 z-10">
            {formatGroupDate(group.date)}
          </h4>
          <div className="space-y-3">
            {group.activities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                onSelect={onSelectActivity}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function groupActivitiesByDate(activities: Activity[]) {
  const groups: Record<string, Activity[]> = {}

  activities.forEach((activity) => {
    const date = new Date(activity.timestamp)
    let key: string

    if (isToday(date)) {
      key = 'today'
    } else if (isYesterday(date)) {
      key = 'yesterday'
    } else if (isThisWeek(date)) {
      key = 'this week'
    } else {
      key = format(date, 'MMM d, yyyy')
    }

    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(activity)
  })

  const sortedGroups = Object.entries(groups)
    .sort(([a], [b]) => {
      if (a === 'today') return -1
      if (b === 'today') return 1
      if (a === 'yesterday') return -1
      if (b === 'yesterday') return 1
      if (a === 'this week') return -1
      if (b === 'this week') return 1
      return new Date(b).getTime() - new Date(a).getTime()
    })
    .map(([date, activities]) => ({
      date,
      activities: activities.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    }))

  return sortedGroups
}

function formatGroupDate(date: string): string {
  if (date === 'today') return 'Today'
  if (date === 'yesterday') return 'Yesterday'
  if (date === 'this week') return 'This Week'
  return date
}

function getActionVerb(type: ActivityType): string {
  const verbs: Record<ActivityType, string> = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
    sent: 'sent',
    received: 'received',
    signed: 'signed',
    paid: 'paid',
    viewed: 'viewed',
    commented: 'commented on',
    mentioned: 'mentioned in',
    status_changed: 'changed status of',
    workflow_triggered: 'triggered workflow for',
    scheduled: 'scheduled',
    completed: 'completed',
    published: 'published',
    archived: 'archived',
    restored: 'restored',
    assigned: 'assigned to',
    tagged: 'tagged',
  }
  return verbs[type] || ''
}