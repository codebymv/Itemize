import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ChartContainer,
    ChartTooltip,
} from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { RevenueTrends } from '@/services/analyticsApi';

export function RevenueTrendsChart({ data, isLoading }: { data?: RevenueTrends; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="h-[200px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
            </div>
        );
    }

    // Create empty data with zero values if no data exists
    const hasData = data?.data && data.data.length > 0;
    const period = data?.period || '30days';
    
    // Generate placeholder data points if no data exists
    const generateEmptyData = () => {
        const now = new Date();
        const dataPoints = [];
        
        if (period === '30days') {
            // Last 30 days - show weekly points
            for (let i = 3; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - (i * 7));
                dataPoints.push({
                    period: date.toISOString(),
                    revenue: 0
                });
            }
        } else {
            // Last 6 or 12 months - show monthly points
            const months = period === '6months' ? 6 : 12;
            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(now);
                date.setMonth(date.getMonth() - i);
                dataPoints.push({
                    period: date.toISOString(),
                    revenue: 0
                });
            }
        }
        
        return dataPoints;
    };

    const rawData = hasData ? data.data : generateEmptyData();

    // Determine if we're showing days or months based on period
    const isDayView = period === '30days';
    const isMonthView = period === '6months' || period === '12months';

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        if (isDayView) {
            // For day view: "Jan 26"
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (isMonthView) {
            // For month view: "Jan 2026"
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        // Fallback: "Jan 26, 2026"
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Format date for tooltip (more detailed)
    const formatTooltipDate = (dateString: string) => {
        const date = new Date(dateString);
        if (isDayView) {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        } else {
            return date.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
            });
        }
    };

    // Prepare chart data with formatted labels
    const chartData = rawData.map(item => ({
        ...item,
        formattedPeriod: formatDate(item.period)
    }));

    const chartConfig = {
        revenue: {
            label: 'Revenue',
            color: 'hsl(142, 76%, 36%)',
        },
    };

    return (
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                    dataKey="formattedPeriod" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    angle={isDayView ? -45 : 0}
                    textAnchor={isDayView ? 'end' : 'middle'}
                    height={isDayView ? 60 : 30}
                />
                <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip 
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const dataPoint = payload[0].payload as typeof chartData[0];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="grid gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[0.70rem] text-muted-foreground">
                                                {formatTooltipDate(dataPoint.period)}
                                            </span>
                                            <span className="font-bold text-foreground">
                                                ${Number(payload[0].value).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(142, 76%, 36%)"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                />
            </AreaChart>
        </ChartContainer>
    );
}