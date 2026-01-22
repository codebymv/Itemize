import React from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  CheckSquare,
  Calendar,
  RefreshCw,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ContactActivity } from '@/types';

interface ActivityTimelineProps {
  activities: ContactActivity[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <MessageSquare className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      case 'status_change':
        return <RefreshCw className="h-4 w-4" />;
      case 'deal_update':
        return <TrendingUp className="h-4 w-4" />;
      case 'system':
        return <Settings className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'note':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'email':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      case 'call':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'task':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      case 'meeting':
        return 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300';
      case 'status_change':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'deal_update':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
      case 'system':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getActivityContent = (activity: ContactActivity) => {
    const content = activity.content as Record<string, any>;

    switch (activity.type) {
      case 'note':
        return content.text || 'Added a note';
      case 'email':
        return content.subject || 'Sent an email';
      case 'call':
        return content.summary || `Call ${content.duration ? `(${content.duration} min)` : ''}`;
      case 'task':
        return content.title || 'Created a task';
      case 'meeting':
        return content.title || 'Scheduled a meeting';
      case 'status_change':
        return `Status changed from ${content.from} to ${content.to}`;
      case 'deal_update':
        return content.description || 'Deal updated';
      case 'system':
        return activity.title || 'System activity';
      default:
        return activity.title || 'Activity';
    }
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No activities yet</p>
          <p className="text-sm text-muted-foreground">
            Add a note to start tracking interactions
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-4">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center ${getActivityColor(
                activity.type
              )}`}
            >
              {getActivityIcon(activity.type)}
            </div>
            {index < activities.length - 1 && (
              <div className="w-px flex-1 bg-border mt-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">
                  {activity.title || activity.type.replace('_', ' ')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {getActivityContent(activity)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                {formatDate(activity.created_at)}
              </span>
            </div>
            {activity.user_name && (
              <p className="text-xs text-muted-foreground mt-1">
                by {activity.user_name}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ActivityTimeline;
