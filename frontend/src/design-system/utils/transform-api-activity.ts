import type { Activity } from '../types/activity.types'
import type { RecentActivity as ApiRecentActivity } from '@/services/analyticsApi'

export function transformApiActivityToDesignSystem(
  apiActivity: ApiRecentActivity
): Activity {
  return {
    id: apiActivity.id.toString(),
    type: 'created',
    itemType: 'contact',
    title: apiActivity.title,
    description: typeof apiActivity.content === 'string' ? apiActivity.content : undefined,
    timestamp: new Date(apiActivity.createdAt),
    metadata: {
      originalApiActivity: apiActivity,
    },
  }
}