import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RevenueFlow } from '@/services/invoicePaymentsApi';
import { RevenueFlowChart, RevenueFlowSeriesControls } from './RevenueFlowChart';

vi.mock('recharts', async () => {
  const React = await import('react');
  const component = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const chart = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  const series = (kind: string) => ({ dataKey }: { dataKey?: string }) => (
    <g data-chart-kind={kind} data-chart-series={dataKey} />
  );
  return {
    Bar: series('bar'),
    CartesianGrid: component,
    ComposedChart: chart,
    Legend: component,
    Line: series('line'),
    ReferenceLine: component,
    ResponsiveContainer: component,
    Tooltip: component,
    XAxis: component,
    YAxis: component,
  };
});

const flow: RevenueFlow = {
  period: '30days',
  startAt: '2026-07-30T07:00:00.000Z',
  endAt: '2026-08-29T07:00:00.000Z',
  timeZone: 'America/Phoenix',
  bucketUnit: 'day',
  currencies: [{
    currency: 'USD',
    summary: {
      bookedSales: 8000,
      bookedDeals: 2,
      failedAmount: 225,
      failedCount: 1,
      grossReceived: 4815.5,
      settledPayments: 6,
      inProgressAmount: 955,
      inProgressCount: 2,
      refunds: 700,
      refundedPayments: 1,
      netReceived: 4115.5,
    },
    buckets: [{
      startAt: '2026-08-20T07:00:00.000Z',
      bookedSales: 8000,
      bookedDeals: 2,
      grossReceived: 4815.5,
      settledPayments: 6,
      refunds: 700,
      refundedPayments: 1,
      netReceived: 4115.5,
    }],
    methods: [{
      paymentMethod: 'card',
      grossReceived: 4815.5,
      settledPayments: 6,
      refunds: 700,
      refundedPayments: 1,
      netReceived: 4115.5,
    }],
  }],
};

describe('RevenueFlowChart', () => {
  it('renders an accessible detailed flow and payment-method breakdown', () => {
    const { container } = render(
      <RevenueFlowChart
        data={flow}
        context="payments"
        size="standard"
        visibleSeries={['bookedSales', 'netReceived', 'refunds']}
        onVisibleSeriesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('img', { name: /revenue flow in usd/i })).toBeInTheDocument();
    expect(screen.getByText('Payment methods')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('$700.00 refunded')).toBeInTheDocument();
    expect(container.querySelector('[data-chart-surface="true"]')).toHaveStyle({
      backgroundColor: 'hsl(var(--background-alt))',
    });
    expect(container.querySelector('[data-chart-kind="bar"][data-chart-series="bookedSales"]')).toBeInTheDocument();
    expect(container.querySelector('[data-chart-kind="bar"][data-chart-series="refundImpact"]')).toBeInTheDocument();
    expect(container.querySelector('[data-chart-kind="line"][data-chart-series="netReceived"]')).toBeInTheDocument();
  });

  it('keeps dashboard context independent from the selected chart height', () => {
    const { container } = render(
      <RevenueFlowChart
        data={flow}
        context="dashboard"
        size="expanded"
        visibleSeries={['bookedSales', 'netReceived', 'refunds']}
        onVisibleSeriesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('img', { name: /revenue flow in usd/i })).toBeInTheDocument();
    expect(screen.queryByText('Payment methods')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart="chart-revenue-flow-USD-dashboard-expanded"]')).toHaveClass('h-[360px]');
  });

  it('renders and announces only the enabled series', () => {
    const { container } = render(
      <RevenueFlowChart
        data={flow}
        context="dashboard"
        size="compact"
        visibleSeries={['netReceived']}
        onVisibleSeriesChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-chart-series="bookedSales"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart-series="refundImpact"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart-series="netReceived"]')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /net received/i })).not.toHaveAccessibleName(/booked sales|refunds/i);
    expect(screen.getByRole('button', { name: 'Revenue series, 1 of 3 visible' })).toBeInTheDocument();
  });

  it('keeps only the compact series menu in the chart surface', () => {
    render(
      <RevenueFlowChart
        data={flow}
        context="dashboard"
        size="compact"
        visibleSeries={['bookedSales', 'netReceived', 'refunds']}
        onVisibleSeriesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Revenue series, 3 of 3 visible' })).toHaveTextContent('Series 3/3');
    expect(screen.queryByRole('group', { name: 'Revenue flow series' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /chart size/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Compact')).not.toBeInTheDocument();
  });

  it('lets the promoted direct controls change visible series', () => {
    const onVisibleSeriesChange = vi.fn();
    render(
      <RevenueFlowSeriesControls
        visibleSeries={['bookedSales', 'netReceived', 'refunds']}
        onVisibleSeriesChange={onVisibleSeriesChange}
        variant="direct"
      />,
    );

    const refunds = screen.getByRole('button', { name: 'Hide Refunds' });
    expect(refunds).toHaveAttribute('data-state', 'on');
    expect(refunds).toHaveClass('data-[state=on]:border-red-500');
    fireEvent.click(refunds);
    expect(onVisibleSeriesChange).toHaveBeenCalledWith(['bookedSales', 'netReceived']);
  });

  it('renders an empty state when the period has no revenue', () => {
    render(
      <RevenueFlowChart
        data={{ ...flow, currencies: [] }}
        context="payments"
        size="standard"
        visibleSeries={['bookedSales', 'netReceived', 'refunds']}
        onVisibleSeriesChange={vi.fn()}
      />,
    );

    expect(screen.getByText('No booked or received revenue in this period')).toBeInTheDocument();
  });
});
