import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { PipelineVelocity } from '@/services/analyticsApi';

export function PipelineVelocityCard({ velocity, isLoading }: { velocity?: PipelineVelocity; isLoading?: boolean }) {
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

    if (!velocity?.velocity || velocity.velocity.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No pipeline data available
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {velocity.velocity.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.stageColor }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{stage.stageName}</span>
                            <div className="flex items-center gap-2">
                                {stage.isBottleneck && (
                                    <span className="text-xs bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-1.5 py-0.5 rounded">
                                        Bottleneck
                                    </span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                    {stage.dealCount} deal{stage.dealCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Avg {stage.avgAgeDays} days</span>
                            <span>${stage.totalValue.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            ))}
            {velocity.summary && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-green-600">{velocity.summary.avgDaysToWin}</div>
                        <div className="text-xs text-muted-foreground">Avg days to win</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{velocity.summary.winRate}%</div>
                        <div className="text-xs text-muted-foreground">Win rate</div>
                    </div>
                </div>
            )}
        </div>
    );
}