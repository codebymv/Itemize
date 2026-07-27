import { Skeleton } from '@/components/ui/skeleton';
import type { PipelineDealAge } from '@/services/analyticsApi';

export function PipelineDealAgeCard({ dealAge, isLoading }: { dealAge?: PipelineDealAge; isLoading?: boolean }) {
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

    if (!dealAge?.stages || dealAge.stages.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No open deals in this pipeline
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {dealAge.stages.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.stageColor }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{stage.stageName}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {stage.openDealCount} deal{stage.openDealCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Avg {stage.averageOpenDealAgeDays} days old</span>
                            <span>
                                {stage.openValueByCurrency.map(({ currency, amount }) => (
                                    `${currency} ${amount.toLocaleString()}`
                                )).join(' · ') || 'No open value'}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
            {dealAge.summary && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-green-600">{dealAge.summary.averageDaysToWin}</div>
                        <div className="text-xs text-muted-foreground">Avg days to win</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{dealAge.summary.winRate}%</div>
                        <div className="text-xs text-muted-foreground">Win rate</div>
                    </div>
                </div>
            )}
        </div>
    );
}
