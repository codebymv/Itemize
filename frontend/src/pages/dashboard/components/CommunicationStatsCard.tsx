import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone } from 'lucide-react';
import type { CommunicationStats } from '@/services/analyticsApi';

function CommunicationStatsCard({ stats, isLoading }: { stats?: CommunicationStats; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
            </div>
        );
    }

    if (!stats || !stats.email || !stats.sms) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No communication data available
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Email Stats */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Email</span>
                    <span className="text-sm text-muted-foreground ml-auto">{stats.email?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-gray-600">{stats.email?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-green-600">{stats.email?.rates?.open ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Opened</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-purple-600">{stats.email?.rates?.click ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Clicked</div>
                    </div>
                </div>
            </div>

            {/* SMS Stats */}
            <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                    <Phone className="h-4 w-4 text-green-600" />
                    <span className="font-medium">SMS</span>
                    <span className="text-sm text-muted-foreground ml-auto">{stats.sms?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-green-600">{stats.sms?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{stats.sms?.outbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Outbound</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{stats.sms?.inbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Inbound</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CommunicationStatsCard;