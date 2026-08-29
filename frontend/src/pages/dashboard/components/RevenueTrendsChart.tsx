import { Skeleton } from '@/components/ui/skeleton';
import {
    ChartContainer,
    ChartTooltip,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { RevenueCurrencyTrend, RevenueTrends } from '@/services/analyticsApi';

const formatPeriod = (value: string, period: string) => new Date(value).toLocaleDateString(
    'en-US',
    period === '30days'
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', year: 'numeric' },
);

const formatCurrency = (value: number, currency: string) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
}).format(value);

function CurrencyTrendChart({ trend, period }: { trend: RevenueCurrencyTrend; period: string }) {
    const chartData = trend.data.map((item) => ({
        ...item,
        formattedPeriod: formatPeriod(item.period, period),
    }));
    const chartConfig = {
        bookedRevenue: { label: 'Booked', color: 'hsl(217, 91%, 60%)' },
        collectedRevenue: { label: 'Collected', color: 'hsl(142, 76%, 36%)' },
    };
    const bookedGradientId = `booked-${trend.currency}`;
    const collectedGradientId = `collected-${trend.currency}`;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{trend.currency}</span>
                <span className="text-muted-foreground">
                    Booked {formatCurrency(trend.summary.totalBookedRevenue, trend.currency)}
                    {' · '}
                    Collected {formatCurrency(trend.summary.totalCollectedRevenue, trend.currency)}
                </span>
            </div>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={bookedGradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id={collectedGradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                        dataKey="formattedPeriod"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        height={period === '30days' ? 50 : 30}
                        angle={period === '30days' ? -35 : 0}
                        textAnchor={period === '30days' ? 'end' : 'middle'}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(Number(value), trend.currency)}
                    />
                    <ChartTooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const point = payload[0].payload as typeof chartData[number];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <p className="text-xs text-muted-foreground">
                                        {formatPeriod(point.period, period)}
                                    </p>
                                    <p className="font-medium text-blue-600 dark:text-blue-400">
                                        Booked: {formatCurrency(point.bookedRevenue, trend.currency)}
                                    </p>
                                    <p className="font-medium text-green-600 dark:text-green-400">
                                        Collected: {formatCurrency(point.collectedRevenue, trend.currency)}
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="bookedRevenue"
                        stroke="hsl(217, 91%, 60%)"
                        strokeWidth={2}
                        fill={`url(#${bookedGradientId})`}
                    />
                    <Area
                        type="monotone"
                        dataKey="collectedRevenue"
                        stroke="hsl(142, 76%, 36%)"
                        strokeWidth={2}
                        fill={`url(#${collectedGradientId})`}
                    />
                </AreaChart>
            </ChartContainer>
        </div>
    );
}

export function RevenueTrendsChart({ data, isLoading }: { data?: RevenueTrends; isLoading?: boolean }) {
    if (isLoading) {
        return <Skeleton className="h-[200px] w-full" />;
    }
    if (!data?.currencies.length) {
        return (
            <div className="py-8 text-center text-muted-foreground">
                No booked or collected revenue in this period
            </div>
        );
    }
    return (
        <div className="space-y-6">
            {data.currencies.map((trend) => (
                <CurrencyTrendChart key={trend.currency} trend={trend} period={data.period} />
            ))}
        </div>
    );
}
