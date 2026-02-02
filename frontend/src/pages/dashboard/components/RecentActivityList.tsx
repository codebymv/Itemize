import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardAnalytics } from '@/services/analyticsApi';

function RecentActivityList({ activities, isLoading }: { activities: DashboardAnalytics['recentActivity']; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3">
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
                No recent activity
            </div>
        );
    }

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'email': return '📧';
            case 'call': return '📞';
            case 'note': return '📝';
            case 'meeting': return '📅';
            case 'deal': return '💰';
            default: return '📌';
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                    <div className="text-lg">{getActivityIcon(activity.type)}</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(activity.createdAt)}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default RecentActivityList;