import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Phone } from 'lucide-react';
import type { CommunicationStats } from '@/services/analyticsApi';

export function CommunicationStatsCard({ stats, isLoading }: { stats?: CommunicationStats; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-4">
                <Card><CardContent className="pt-6"><Skeleton className="h-20" /></CardContent></Card>
                <Card><CardContent className="pt-6"><Skeleton className="h-20" /></CardContent></Card>
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

    const EmailCommunicationCard = () => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-medium">Email</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{stats.email?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.email?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.email?.rates?.open ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Opened</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.email?.rates?.click ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Clicked</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const SMSCommunicationCard = () => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                            <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-medium">SMS</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{stats.sms?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.sms?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.sms?.outbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Outbound</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-blue-600">{stats.sms?.inbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Inbound</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-4">
            {/* Email Stats */}
            <EmailCommunicationCard />
            {/* SMS Stats */}
            <SMSCommunicationCard />
        </div>
    );
}