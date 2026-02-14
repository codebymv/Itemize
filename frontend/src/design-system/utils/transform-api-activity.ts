import type { Activity } from '../types/activity.types'
import type { RecentActivity as ApiRecentActivity } from '@/services/analyticsApi'

export function transformApiActivityToDesignSystem(
  apiActivity: ApiRecentActivity
): Activity {
  const itemType = inferItemTypeFromActivity(apiActivity)
  const activityType = inferActivityTypeFromActivityType(apiActivity.type)
  
  return {
    id: apiActivity.id.toString(),
    type: activityType,
    itemType,
    title: apiActivity.title,
    description: typeof apiActivity.content === 'string' ? apiActivity.content : undefined,
    timestamp: new Date(apiActivity.createdAt),
    actor: { 
      id: 'unknown', 
      name: 'System' 
    },
    metadata: {
      originalApiActivity: apiActivity,
    },
  }
}

function inferItemTypeFromActivity(activity: ApiRecentActivity): Activity['itemType'] {
  const type = activity.type.toLowerCase()
  const title = activity.title.toLowerCase()
  
  if (title.includes('invoice') || type.includes('payment') || type.includes('invoice')) {
    return 'invoice' as const
  }
  if (title.includes('contract') || title.includes('agreement') || type.includes('signature')) {
    return 'signature' as const
  }
  if (title.includes('campaign') || title.includes('email') || type.includes('email')) {
    return 'campaign' as const
  }
  if (title.includes('contact') || type.includes('contact') || type.includes('crm')) {
    return 'contact' as const
  }
  if (title.includes('deal') || type.includes('deal')) {
    return 'contact' as const
  }
  if (title.includes('note') || type.includes('note')) {
    return 'note' as const
  }
  if (title.includes('list') || type.includes('list')) {
    return 'list' as const
  }
  if (title.includes('meeting') || type.includes('meeting')) {
    return 'booking' as const
  }
  
  return 'contact' as const
}

function inferActivityTypeFromActivityType(apiType: string): Activity['type'] {
  const type = apiType.toLowerCase()
  
  switch (type) {
    case 'email':
    case 'sent':
      return 'sent' as const
    case 'note':
    case 'commented':
      return 'commented' as const
    case 'call':
      return 'created' as const
    case 'task':
      return 'created' as const
    case 'meeting':
      return 'scheduled' as const
    case 'status_change':
      return 'status_changed' as const
    case 'deal_update':
      return 'updated' as const
    case 'system':
      return 'created' as const
    default:
      return 'created' as const
  }
}