import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardAnalytics } from '@/services/analyticsApi';

export function PipelineFunnel({ funnel, isLoading }: { funnel: DashboardAnalytics['deals']['funnel']; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>
        );
    }

    if (!funnel || funnel.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No pipeline data available
            </div>
        );
    }

    const maxCount = Math.max(...funnel.map(s => s.dealCount), 1);

    return (
        <div className="space-y-3">
            {funnel.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.stageColor }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{stage.stageName}</span>
                            <span className="text-sm text-muted-foreground">
                                {stage.dealCount} deal{stage.dealCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <Progress
                            value={(stage.dealCount / maxCount) * 100}
                            className="h-2"
                            style={{ '--progress-color': stage.stageColor } as React.CSSProperties}
                        />
                    </div>
                    <div className="text-sm font-medium w-20 text-right">
                        ${stage.totalValue.toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    );
}