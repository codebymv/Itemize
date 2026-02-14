import React from 'react'
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { semanticColors, designTokens } from '@/design-system/design-tokens'
import type { Activity, ActivityType } from '@/design-system/types/activity.types'

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

const activityTypeIcons: Record<ActivityType, { icon: string; color: string }> = {
  created: { icon: '➕', color: 'text-green-600' },
  updated: { icon: '✏️', color: 'text-blue-600' },
  deleted: { icon: '🗑️', color: 'text-red-600' },
  sent: { icon: '📤', color: 'text-blue-600' },
  received: { icon: '📥', color: 'text-purple-600' },
  signed: { icon: '✍️', color: 'text-green-600' },
  paid: { icon: '💳', color: 'text-green-600' },
  viewed: { icon: '👁️', color: 'text-gray-600' },
  commented: { icon: '💬', color: 'text-purple-600' },
  mentioned: { icon: '@', color: 'text-blue-600' },
  status_changed: { icon: '🔄', color: 'text-orange-600' },
  workflow_triggered: { icon: '⚡', color: 'text-yellow-600' },
  scheduled: { icon: '📅', color: 'text-blue-600' },
  completed: { icon: '✅', color: 'text-green-600' },
  published: { icon: '📢', color: 'text-blue-600' },
  archived: { icon: '🗄️', color: 'text-gray-600' },
  restored: { icon: '♻️', color: 'text-green-600' },
  assigned: { icon: '👤', color: 'text-blue-600' },
  tagged: { icon: '🏷️', color: 'text-orange-600' },
}

const itemLabels = {
  invoice: 'Invoice',
  contact: 'Contact',
  signature: 'Signature',
  campaign: 'Campaign',
  workflow: 'Workflow',
  note: 'Note',
  list: 'List',
  contract: 'Contract',
  payment: 'Payment',
  booking: 'Booking',
  form: 'Form',
  landing_page: 'Page',
} as const

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
        <div className="text-4xl mb-4">📋</div>
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

function ActivityItem({
  activity,
  onSelect,
}: {
  activity: Activity
  onSelect?: (activity: Activity) => void
}) {
  const typeInfo = activityTypeIcons[activity.type]
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
        <div className={cn('flex-shrink-0 text-xl', typeInfo.color)}>
          {typeInfo.icon}
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
                    className={cn(
                      'text-sm hover:underline',
                      getItemColor(activity.itemType)
                    )}
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

          {activity.actor && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {activity.actor.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{activity.actor.name}</span>
              {activity.metadata?.actionedBySystem && (
                <span className="text-muted-foreground">· Automated</span>
              )}
            </div>
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
            <Skeleton className="h-5 w-5 rounded-full" />
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

function getItemColor(itemType: Activity['itemType']): string {
  switch (itemType) {
    case 'invoice':
    case 'payment':
      return semanticColors.module.invoice
    case 'contact':
      return semanticColors.module.contact
    case 'signature':
    case 'contract':
      return semanticColors.module.signature
    case 'campaign':
      return semanticColors.module.campaign
    case 'workflow':
      return semanticColors.module.workflow
    case 'note':
    case 'list':
      return semanticColors.module.workflow
    case 'booking':
      return semanticColors.module.calendar
    case 'form':
    case 'landing_page':
      return 'text-purple-600 dark:text-purple-400'
    default:
      return 'text-blue-600 dark:text-blue-400'
  }
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