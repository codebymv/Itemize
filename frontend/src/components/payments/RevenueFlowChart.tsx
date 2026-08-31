import { ListFilter } from 'lucide-react';
import { useId } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartSurface, ChartTooltip } from '@/components/ui/chart';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  RevenueFlowContext,
  RevenueFlowSeries,
  RevenueFlowSize,
} from '@/hooks/useRevenueFlowPreferences';
import { cn } from '@/lib/utils';
import type {
  RevenueFlow,
  RevenueFlowCurrency,
} from '@/services/invoicePaymentsApi';

const SERIES_OPTIONS: Array<{
  id: RevenueFlowSeries;
  label: string;
  markerClassName: string;
  activeClassName: string;
}> = [
  {
    id: 'bookedSales',
    label: 'Booked sales',
    markerClassName: 'h-2 w-3 rounded-[2px] bg-blue-600 dark:bg-blue-400',
    activeClassName: 'data-[state=on]:border-blue-500 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-700 data-[state=on]:ring-1 data-[state=on]:ring-blue-500/30 dark:data-[state=on]:border-blue-400 dark:data-[state=on]:bg-blue-400/20 dark:data-[state=on]:text-blue-200',
  },
  {
    id: 'netReceived',
    label: 'Net received',
    markerClassName: 'h-0.5 w-3 rounded-full bg-green-600 dark:bg-green-400',
    activeClassName: 'data-[state=on]:border-green-500 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-700 data-[state=on]:ring-1 data-[state=on]:ring-green-500/30 dark:data-[state=on]:border-green-400 dark:data-[state=on]:bg-green-400/20 dark:data-[state=on]:text-green-200',
  },
  {
    id: 'refunds',
    label: 'Refunds',
    markerClassName: 'h-2 w-2 rounded-[1px] bg-red-600 dark:bg-red-400',
    activeClassName: 'data-[state=on]:border-red-500 data-[state=on]:bg-red-500/20 data-[state=on]:text-red-700 data-[state=on]:ring-1 data-[state=on]:ring-red-500/30 dark:data-[state=on]:border-red-400 dark:data-[state=on]:bg-red-400/20 dark:data-[state=on]:text-red-200',
  },
];

const SIZE_HEIGHT_CLASSES: Record<RevenueFlowSize, string> = {
  compact: 'h-[200px]',
  standard: 'h-[280px]',
  expanded: 'h-[360px]',
};

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
        <EmptyState kind="inline" title="No settled payments in this period" className="items-start px-0 py-6 text-left" />
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

export function RevenueFlowSeriesControls({
  visibleSeries,
  onVisibleSeriesChange,
  variant,
  className,
}: {
  visibleSeries: RevenueFlowSeries[];
  onVisibleSeriesChange: (series: RevenueFlowSeries[]) => void;
  variant: 'direct' | 'menu';
  className?: string;
}) {
  const groupId = useId();
  const toggleSeries = (series: RevenueFlowSeries, checked: boolean) => {
    const next = checked
      ? SERIES_OPTIONS.map((option) => option.id).filter((id) => visibleSeries.includes(id) || id === series)
      : visibleSeries.filter((id) => id !== series);
    if (next.length > 0) onVisibleSeriesChange(next);
  };

  if (variant === 'menu') {
    return (
      <div className={cn('flex justify-end', className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="compact"
              aria-label={`Revenue series, ${visibleSeries.length} of ${SERIES_OPTIONS.length} visible`}
            >
              <ListFilter aria-hidden="true" />
              Series {visibleSeries.length}/{SERIES_OPTIONS.length}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Series</DropdownMenuLabel>
            {SERIES_OPTIONS.map((option) => {
              const checked = visibleSeries.includes(option.id);
              return (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={checked}
                  disabled={checked && visibleSeries.length === 1}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(nextChecked) => toggleSeries(option.id, nextChecked === true)}
                >
                  <span className={cn('mr-2 shrink-0', option.markerClassName)} />
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      value={visibleSeries}
      aria-label="Revenue flow series"
      className={className}
      onValueChange={(next) => {
        if (next.length > 0) onVisibleSeriesChange(next as RevenueFlowSeries[]);
      }}
    >
      {SERIES_OPTIONS.map((option) => {
        const active = visibleSeries.includes(option.id);
        return (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            aria-label={`${active ? 'Hide' : 'Show'} ${option.label}`}
            aria-describedby={`${groupId}-${option.id}`}
            disabled={active && visibleSeries.length === 1}
            className={cn(
              'gap-1.5 px-2 text-xs font-medium text-muted-foreground data-[state=off]:opacity-60 data-[state=off]:hover:opacity-100',
              option.activeClassName,
            )}
          >
            <span aria-hidden="true" className={cn('shrink-0', option.markerClassName)} />
            <span id={`${groupId}-${option.id}`}>{option.label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function CurrencyRevenueFlow({
  trend,
  flow,
  context,
  size,
  visibleSeries,
  onVisibleSeriesChange,
  showCurrency,
}: {
  trend: RevenueFlowCurrency;
  flow: RevenueFlow;
  context: RevenueFlowContext;
  size: RevenueFlowSize;
  visibleSeries: RevenueFlowSeries[];
  onVisibleSeriesChange: (series: RevenueFlowSeries[]) => void;
  showCurrency: boolean;
}) {
  const chartData = trend.buckets.map((bucket) => ({
    ...bucket,
    label: formatBucket(bucket.startAt, flow.bucketUnit, flow.timeZone),
    refundImpact: bucket.refunds === 0 ? 0 : -bucket.refunds,
  }));
  const safeCurrency = trend.currency.replace(/[^A-Za-z0-9_-]/g, '');
  const chartId = `revenue-flow-${safeCurrency}-${context}-${size}`;
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
        <ChartSurface
          className={cn(
            'revenue-flow-surface grid gap-6',
            context === 'payments' && 'xl:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]',
          )}
        >
          <div className="min-w-0">
            <RevenueFlowSeriesControls
              visibleSeries={visibleSeries}
              onVisibleSeriesChange={onVisibleSeriesChange}
              variant="menu"
              className="revenue-flow-series-compact mb-3"
            />
            <div
              role="img"
              aria-label={`Revenue flow in ${trend.currency}: ${visibleSeries.map((series) => {
                if (series === 'bookedSales') return `booked sales ${formatCurrency(trend.summary.bookedSales, trend.currency)}`;
                if (series === 'netReceived') return `net received ${formatCurrency(trend.summary.netReceived, trend.currency)}`;
                return `refunds ${formatCurrency(trend.summary.refunds, trend.currency)}`;
              }).join(', ')}`}
            >
              <ChartContainer
                id={chartId}
                config={{
                  bookedSales: {
                    label: 'Booked sales',
                    theme: {
                      light: 'hsl(221.2, 83.2%, 53.3%)',
                      dark: 'hsl(213.1, 93.9%, 67.8%)',
                    },
                  },
                  netReceived: {
                    label: 'Net received',
                    theme: {
                      light: 'hsl(142, 71%, 40%)',
                      dark: 'hsl(142, 69%, 58%)',
                    },
                  },
                  refundImpact: {
                    label: 'Refunds',
                    theme: {
                      light: 'hsl(0, 72%, 51%)',
                      dark: 'hsl(0, 91%, 71%)',
                    },
                  },
                  gridLine: {
                    label: 'Grid line',
                    theme: {
                      light: 'hsl(214, 25%, 78%)',
                      dark: 'hsl(215, 20%, 40%)',
                    },
                  },
                }}
                className={cn('w-full', SIZE_HEIGHT_CLASSES[size])}
              >
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-gridLine)"
                    strokeOpacity={0.9}
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={0}
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.55}
                    strokeWidth={1}
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={size === 'compact' ? 30 : 18}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={size === 'compact' ? 52 : 68}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => formatCurrency(Number(value), trend.currency, true)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0].payload as typeof chartData[number];
                      return (
                        <div className="min-w-44 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
                          <p className="mb-2 text-xs text-muted-foreground">{point.label}</p>
                          <div className="space-y-1 text-xs">
                            {visibleSeries.includes('bookedSales') ? <p className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                              <span>Booked sales</span><strong>{formatCurrency(point.bookedSales, trend.currency)}</strong>
                            </p> : null}
                            {visibleSeries.includes('netReceived') ? <p className="flex justify-between gap-4 text-green-600 dark:text-green-400">
                              <span>Net received</span><strong>{formatCurrency(point.netReceived, trend.currency)}</strong>
                            </p> : null}
                            {visibleSeries.includes('refunds') ? <p className="flex justify-between gap-4 text-red-600 dark:text-red-400">
                              <span>Refunds</span><strong>{formatCurrency(point.refunds, trend.currency)}</strong>
                            </p> : null}
                            <p className="flex justify-between gap-4 text-muted-foreground">
                              <span>Gross received</span><strong>{formatCurrency(point.grossReceived, trend.currency)}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {visibleSeries.includes('bookedSales') ? <Bar
                    dataKey="bookedSales"
                    stackId="flow"
                    fill="var(--color-bookedSales)"
                    fillOpacity={0.72}
                    maxBarSize={18}
                    radius={[3, 3, 0, 0]}
                  /> : null}
                  {visibleSeries.includes('refunds') ? <Bar
                    dataKey="refundImpact"
                    stackId="flow"
                    fill="var(--color-refundImpact)"
                    fillOpacity={0.88}
                    maxBarSize={18}
                    radius={[0, 0, 3, 3]}
                  /> : null}
                  {visibleSeries.includes('netReceived') ? <Line
                    type="monotone"
                    dataKey="netReceived"
                    stroke="var(--color-netReceived)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  /> : null}
                </ComposedChart>
              </ChartContainer>
            </div>
          </div>
          {context === 'payments' && <MethodBreakdown trend={trend} />}
        </ChartSurface>
      )}
    </section>
  );
}

export function RevenueFlowChart({
  data,
  isLoading = false,
  context,
  size,
  visibleSeries,
  onVisibleSeriesChange,
}: {
  data?: RevenueFlow | null;
  isLoading?: boolean;
  context: RevenueFlowContext;
  size: RevenueFlowSize;
  visibleSeries: RevenueFlowSeries[];
  onVisibleSeriesChange: (series: RevenueFlowSeries[]) => void;
}) {
  if (isLoading) return <Skeleton className={cn('w-full', SIZE_HEIGHT_CLASSES[size])} />;
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
          context={context}
          size={size}
          visibleSeries={visibleSeries}
          onVisibleSeriesChange={onVisibleSeriesChange}
          showCurrency={data.currencies.length > 1}
        />
      ))}
    </div>
  );
}
