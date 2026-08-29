import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type {
  RevenueFlow,
  RevenueFlowCurrency,
} from '@/services/invoicePaymentsApi';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from 'recharts';

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  stripe: 'Stripe',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  check: 'Check',
  other: 'Other',
};

const formatCurrency = (value: number, currency: string, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(value) >= 10_000 ? 'compact' : 'standard',
  }).format(value);

const formatBucket = (
  value: string,
  unit: RevenueFlow['bucketUnit'],
  timeZone: string,
) => new Intl.DateTimeFormat('en-US', unit === 'day'
  ? { month: 'short', day: 'numeric', timeZone }
  : unit === 'year'
    ? { year: 'numeric', timeZone }
    : { month: 'short', year: '2-digit', timeZone }
).format(new Date(value));

function MethodBreakdown({ trend }: { trend: RevenueFlowCurrency }) {
  const maximum = Math.max(...trend.methods.map((method) => method.grossReceived), 0);
  return (
    <div className="min-w-0 space-y-4 xl:border-l xl:border-border/60 xl:pl-6">
      <div>
        <h3 className="text-sm font-medium">Payment methods</h3>
        <p className="text-xs text-muted-foreground">Gross received by method</p>
      </div>
      {trend.methods.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No settled payments in this period</p>
      ) : (
        <div className="space-y-4">
          {trend.methods.map((method) => (
            <div key={method.paymentMethod} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-muted-foreground">
                  {METHOD_LABELS[method.paymentMethod] ?? method.paymentMethod}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatCurrency(method.grossReceived, trend.currency)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
                  style={{ width: `${maximum > 0 ? Math.max(3, (method.grossReceived / maximum) * 100) : 0}%` }}
                />
              </div>
              <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{method.settledPayments} payment{method.settledPayments === 1 ? '' : 's'}</span>
                {method.refunds > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {formatCurrency(method.refunds, trend.currency)} refunded
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CurrencyRevenueFlow({
  trend,
  flow,
  compact,
  showCurrency,
}: {
  trend: RevenueFlowCurrency;
  flow: RevenueFlow;
  compact: boolean;
  showCurrency: boolean;
}) {
  const chartData = trend.buckets.map((bucket) => ({
    ...bucket,
    label: formatBucket(bucket.startAt, flow.bucketUnit, flow.timeZone),
    refundImpact: bucket.refunds === 0 ? 0 : -bucket.refunds,
  }));
  const safeCurrency = trend.currency.replace(/[^A-Za-z0-9_-]/g, '');
  const bookedGradient = `revenue-booked-${safeCurrency}-${compact ? 'compact' : 'detail'}`;
  const netGradient = `revenue-net-${safeCurrency}-${compact ? 'compact' : 'detail'}`;
  const hasActivity = trend.summary.bookedSales !== 0
    || trend.summary.grossReceived !== 0
    || trend.summary.refunds !== 0;

  return (
    <section className="space-y-4">
      {showCurrency && <h3 className="text-sm font-medium">{trend.currency}</h3>}
      {!hasActivity ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No booked or received revenue in this period
        </div>
      ) : (
        <div className={cn('grid gap-6', !compact && 'xl:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]')}>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                Booked sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
                Net received
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 bg-red-600 dark:bg-red-400" />
                Refunds
              </span>
            </div>
            <div
              role="img"
              aria-label={`Revenue flow in ${trend.currency}: booked sales ${formatCurrency(trend.summary.bookedSales, trend.currency)}, net received ${formatCurrency(trend.summary.netReceived, trend.currency)}, and refunds ${formatCurrency(trend.summary.refunds, trend.currency)}`}
            >
              <ChartContainer
                config={{
                  bookedSales: { label: 'Booked sales', color: 'hsl(217, 91%, 60%)' },
                  netReceived: { label: 'Net received', color: 'hsl(142, 71%, 45%)' },
                  refundImpact: { label: 'Refunds', color: 'hsl(0, 72%, 51%)' },
                }}
                className={cn('w-full', compact ? 'h-[200px]' : 'h-[280px]')}
              >
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={bookedGradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={netGradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={compact ? 30 : 18}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={compact ? 52 : 68}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => formatCurrency(Number(value), trend.currency, true)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0].payload as typeof chartData[number];
                      return (
                        <div className="min-w-44 rounded-lg border bg-background p-3 shadow-sm">
                          <p className="mb-2 text-xs text-muted-foreground">{point.label}</p>
                          <div className="space-y-1 text-xs">
                            <p className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                              <span>Booked sales</span><strong>{formatCurrency(point.bookedSales, trend.currency)}</strong>
                            </p>
                            <p className="flex justify-between gap-4 text-green-600 dark:text-green-400">
                              <span>Net received</span><strong>{formatCurrency(point.netReceived, trend.currency)}</strong>
                            </p>
                            <p className="flex justify-between gap-4 text-red-600 dark:text-red-400">
                              <span>Refunds</span><strong>{formatCurrency(point.refunds, trend.currency)}</strong>
                            </p>
                            <p className="flex justify-between gap-4 text-muted-foreground">
                              <span>Gross received</span><strong>{formatCurrency(point.grossReceived, trend.currency)}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="refundImpact"
                    fill="hsl(0, 72%, 51%)"
                    opacity={0.72}
                    maxBarSize={14}
                    radius={[0, 0, 3, 3]}
                  />
                  <Area
                    type="monotone"
                    dataKey="bookedSales"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    fill={`url(#${bookedGradient})`}
                  />
                  <Area
                    type="monotone"
                    dataKey="netReceived"
                    stroke="hsl(142, 71%, 45%)"
                    strokeWidth={2}
                    fill={`url(#${netGradient})`}
                  />
                </ComposedChart>
              </ChartContainer>
            </div>
          </div>
          {!compact && <MethodBreakdown trend={trend} />}
        </div>
      )}
    </section>
  );
}

export function RevenueFlowChart({
  data,
  isLoading = false,
  compact = false,
}: {
  data?: RevenueFlow | null;
  isLoading?: boolean;
  compact?: boolean;
}) {
  if (isLoading) return <Skeleton className={compact ? 'h-[200px] w-full' : 'h-[280px] w-full'} />;
  if (!data?.currencies.length) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No booked or received revenue in this period
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {data.currencies.map((trend) => (
        <CurrencyRevenueFlow
          key={trend.currency}
          trend={trend}
          flow={data}
          compact={compact}
          showCurrency={data.currencies.length > 1}
        />
      ))}
    </div>
  );
}
