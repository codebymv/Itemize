import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { LucideIcon } from 'lucide-react';

export function ConversionRateCard({ 
    title, 
    rate, 
    numerator, 
    denominator, 
    icon: Icon, 
    color = 'text-green-600',
    isLoading 
}: { 
    title: string;
    rate: number;
    numerator: number;
    denominator: number;
    icon: LucideIcon;
    color?: string;
    isLoading?: boolean;
}) {
    if (isLoading) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                    <Skeleton className="h-4 w-24 mt-2" />
                    <Skeleton className="h-2 w-full mt-2" />
                </CardContent>
            </Card>
        );
    }

return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-full bg-muted ${color}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-right">
                        <div className={`text-2xl font-bold ${color}`}>{rate.toFixed(1)}%</div>
                    </div>
                </div>
                <div className="mt-2">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">
                        {numerator} of {denominator}
                    </p>
                    <Progress value={rate} className="mt-2 h-2" />
                </div>
            </CardContent>
        </Card>
    );
}