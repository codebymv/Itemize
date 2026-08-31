import { describe, expect, it } from 'vitest';

import type { CommunicationStats, ConversionRates, PipelineDealAge } from '@/services/analyticsApi';
import type { RevenueFlow } from '@/services/invoicePaymentsApi';
import {
  buildDashboardSignals,
  DASHBOARD_SIGNAL_IDS,
} from './dashboardSignalCatalog';

const revenue: RevenueFlow = {
  period: '30days',
  endAt: '2026-08-30T00:00:00Z',
  timeZone: 'America/Phoenix',
  bucketUnit: 'day',
  currencies: [{
    currency: 'USD',
    summary: {
      bookedSales: 9200,
      bookedDeals: 3,
      failedAmount: 120,
      failedCount: 2,
      grossReceived: 5400,
      settledPayments: 4,
      inProgressAmount: 0,
      inProgressCount: 0,
      refunds: 200,
      refundedPayments: 1,
      netReceived: 5200,
    },
    buckets: [],
    methods: [],
  }],
};

const conversions: ConversionRates = {
  period: '30days',
  dealWinRate: { rate: 42.5, won: 17, lost: 23, totalClosed: 40, valuesByCurrency: [] },
  formToContact: { rate: 60, submissions: 10, converted: 6 },
};

const communications: CommunicationStats = {
  period: '30days',
  email: {
    total: 12,
    sent: 12,
    delivered: 10,
    opened: 6,
    clicked: 2,
    bounced: 1,
    failed: 1,
    rates: { delivery: 83.3, open: 60, click: 20 },
  },
  sms: {
    total: 5,
    outbound: 3,
    inbound: 2,
    sent: 3,
    delivered: 2,
    failed: 1,
    segments: 3,
    rates: { delivery: 66.7 },
  },
};

const pipelineDealAge: PipelineDealAge = {
  pipeline: { id: 1, name: 'Default pipeline' },
  stages: [
    { stageId: '1', stageName: 'Lead', stageColor: '#3b82f6', stageOrder: 1, openDealCount: 2, averageOpenDealAgeDays: 4, openValueByCurrency: [{ currency: 'USD', amount: 1200 }] },
    { stageId: '2', stageName: 'Proposal', stageColor: '#8b5cf6', stageOrder: 2, openDealCount: 1, averageOpenDealAgeDays: 2, openValueByCurrency: [{ currency: 'USD', amount: 800 }] },
  ],
  summary: { averageDaysToWin: 3, averageDaysToLose: 6, openDeals: 3, wonDeals: 2, lostDeals: 1, winRate: 66.7 },
};

describe('dashboard signal catalog', () => {
  const signals = buildDashboardSignals({ revenue, conversions, communications, pipelineDealAge });

  it('provides every stable catalog identifier exactly once', () => {
    expect(signals.map((signal) => signal.id)).toEqual(DASHBOARD_SIGNAL_IDS);
    expect(new Set(signals.map((signal) => signal.id)).size).toBe(signals.length);
  });

  it('uses semantic severity for actionable failures and friendly timeframes', () => {
    expect(signals.find((signal) => signal.id === 'payment-failures')).toMatchObject({
      value: '2',
      theme: 'red',
      requiresAttention: true,
      timeframe: 'Last 30 days',
    });
    expect(signals.find((signal) => signal.id === 'email-failures')?.supportingText).toBe('12 total emails');
  });

  it('aggregates multi-stage pipeline value into one navigable signal', () => {
    expect(signals.find((signal) => signal.id === 'pipeline-open-value')).toMatchObject({
      value: '$2,000',
      compactValue: '$2K',
      source: 'Pipelines',
      route: '/pipelines',
    });
  });

  it('keeps currency identity when dashboard money signals compact', () => {
    expect(signals.find((signal) => signal.id === 'revenue-booked')).toMatchObject({
      value: '$9,200',
      compactValue: '$9.2K',
      supportingText: 'USD',
    });
  });

  it('keeps optional failed sources visibly unavailable', () => {
    const failed = buildDashboardSignals({ errors: { communications: true } });
    expect(failed.find((signal) => signal.id === 'email-open-rate')?.status).toBe('unavailable');
  });
});
