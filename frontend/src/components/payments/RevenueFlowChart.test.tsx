import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RevenueFlow } from '@/services/invoicePaymentsApi';
import { RevenueFlowChart } from './RevenueFlowChart';

vi.mock('recharts', async () => {
  const React = await import('react');
  const component = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const chart = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    Area: component,
    Bar: component,
    CartesianGrid: component,
    ComposedChart: chart,
    Legend: component,
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
    render(<RevenueFlowChart data={flow} />);

    expect(screen.getByRole('img', { name: /revenue flow in usd/i })).toBeInTheDocument();
    expect(screen.getByText('Payment methods')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('$700.00 refunded')).toBeInTheDocument();
  });

  it('omits the method breakdown in compact mode', () => {
    render(<RevenueFlowChart data={flow} compact />);

    expect(screen.getByRole('img', { name: /revenue flow in usd/i })).toBeInTheDocument();
    expect(screen.queryByText('Payment methods')).not.toBeInTheDocument();
  });

  it('renders an empty state when the period has no revenue', () => {
    render(<RevenueFlowChart data={{ ...flow, currencies: [] }} />);

    expect(screen.getByText('No booked or received revenue in this period')).toBeInTheDocument();
  });
});
