import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, BadgeCheck, Sparkles } from 'lucide-react';
import type { ConversionRates } from '@/services/analyticsApi';

function ConversionRateCard({
    rates,
    periodLabel,
    isLoading,
}: {
    rates?: ConversionRates;
    periodLabel?: string;
    isLoading?: boolean;
}) {
    if (isLoading) {
        return (
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    const conversions = rates?.conversions;
    if (!conversions) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No conversion data available
            </div>
        );
    }

    return (
        <div className="p-4 bg-muted/30 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Conversion Rates</span>
                {periodLabel && (
                    <span className="text-xs text-muted-foreground">{periodLabel}</span>
                )}
            </div>

            <div className="grid gap-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-background/60">
                    <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">Lead → Customer</span>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold">{conversions.leadToCustomer.rate ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">
                            {conversions.leadToCustomer.customers ?? 0} of {conversions.leadToCustomer.total ?? 0}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-md bg-background/60">
                    <div className="flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Deal Win Rate</span>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold">{conversions.dealWinRate.rate ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">
                            {conversions.dealWinRate.won ?? 0} of {conversions.dealWinRate.totalClosed ?? 0}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-md bg-background/60">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">Form → Contact</span>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold">{conversions.formToContact.rate ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">
                            {conversions.formToContact.converted ?? 0} of {conversions.formToContact.submissions ?? 0}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ConversionRateCard;