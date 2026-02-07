import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardAnalytics } from '@/services/analyticsApi';
import {
    Mail,
    Phone,
    StickyNote,
    Calendar,
    DollarSign,
    CheckCircle,
    Users,
    GitBranch,
    Bot,
    Clock,
} from 'lucide-react';

interface getActivityConfigReturn {
    icon: React.ForwardRefExoticComponent<any>;
    color: string;
    bgColor: string;
}

const getActivityConfig = (type: string): getActivityConfigReturn => {
    // CRM activity types - matching backend contact_activities table CHECK constraint
    // Valid types: 'note', 'email', 'call', 'task', 'meeting', 'status_change', 'deal_update', 'system'
    // All use gray background with blue icon for consistent design
    switch (type) {
        case 'note':
            return {
                icon: StickyNote,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'email':
            return {
                icon: Mail,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'call':
            return {
                icon: Phone,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'task':
            return {
                icon: CheckCircle,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'meeting':
            return {
                icon: Users,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'status_change':
            return {
                icon: GitBranch,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'deal_update':
            return {
                icon: DollarSign,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        case 'system':
            return {
                icon: Users,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
        default:
            return {
                icon: Clock,
                color: 'text-blue-600',
                bgColor: 'bg-gray-100 dark:bg-gray-900',
            };
    }
};

const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const Icon = ({ icon: IconComponent, className }: { icon: any; className?: string }) => (
    <IconComponent className={className} />
);

export function RecentActivityList({ activities, isLoading }: { activities: DashboardAnalytics['recentActivity']; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!activities || activities.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No recent activity yet
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => {
                const config = getActivityConfig(activity.type);
                const IconComponent = config.icon;
                
                return (
                    <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${config.bgColor} transition-transform group-hover:scale-110`}>
                            <IconComponent className={config.color} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{activity.title}</p>
                            {activity.content && (
                                <p className="text-xs text-muted-foreground truncate">
                                    {typeof activity.content === 'string' 
                                        ? activity.content 
                                        : typeof activity.content === 'object'
                                            ? Object.entries(activity.content)
                                                .filter(([key, value]) => typeof value === 'string' || value === null || value === undefined)
                                                .map(([key, value]) => `${key}: ${value}`)
                                                .join(' | ')
                                            : String(activity.content)
                                    }
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(activity.createdAt)}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}