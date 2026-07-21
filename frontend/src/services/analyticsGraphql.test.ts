import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest } from './graphqlClient';
import {
  getBookingAnalyticsViaGraphql,
  getCommunicationStatsViaGraphql,
  getContactTrendsViaGraphql,
  getDashboardAnalyticsViaGraphql,
  getDealPerformanceViaGraphql,
  getWorkflowPerformanceViaGraphql,
} from './analyticsGraphql';

vi.mock('./graphqlClient', () => ({ graphqlRequest: vi.fn() }));

const dashboard = {
  asOf: '2026-07-20T18:00:00.000Z',
  reportingTimezone: 'UTC',
  contacts: {
    total: 2, active: 1, leads: 0, customers: 0,
    newThisMonth: 1, newThisWeek: 1,
    growth: [{ month: '2026-07-01T00:00:00.000Z', count: 1 }],
  },
  deals: {
    total: 2, open: 1, won: 1, lost: 0, openValue: 25,
    wonValue: 150, wonThisMonth: 150,
    bookedValue: 100, bookedThisMonth: 100,
    collectedValue: 50, collectedThisMonth: 50,
    funnel: [{
      stageId: 'proposal', stageName: 'Proposal', stageColor: '#123456',
      dealCount: 1, totalValue: 25,
    }],
  },
  bookings: {
    total: 1, confirmed: 1, pending: 0, cancelled: 0,
    upcomingThisWeek: 1, upcomingToday: 1,
  },
  tasks: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
  pipelines: { total: 1 },
  recentActivity: [{
    id: 9, type: 'system', title: 'Created', content: { action: 'created' },
    createdAt: '2026-07-20T17:00:00.000Z', contactId: 3,
  }],
  invoiceMetrics: {
    pending: 1, overdue: 0, paidThisMonth: 0, countThisMonth: 1,
    recentInvoices: [{ id: 12, number: 'INV-12', amount: 20, status: 'sent' }],
  },
  signatureMetrics: {
    awaiting: 0, signedThisWeek: 0, total: 0,
    recentDocuments: [{
      id: 13, title: 'Agreement', status: 'draft', date: '2026-07-20T16:00:00.000Z',
    }],
  },
  workspaceMetrics: { activeItems: 0, lists: 0, notes: 0, recentItems: [] },
};

describe('dashboard analytics GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests the typed snapshot and preserves the existing dashboard shape', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({ dashboardAnalytics: dashboard });

    await expect(getDashboardAnalyticsViaGraphql(4)).resolves.toMatchObject({
      asOf: dashboard.asOf,
      deals: { wonValue: 150, bookedValue: 100, collectedValue: 50 },
      invoiceMetrics: { recentInvoices: [{ id: '12' }] },
      signatureMetrics: { recentDocuments: [{ id: '13' }] },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query DashboardAnalytics'),
      {},
      4,
    );
  });

  it('maps legacy period values to typed GraphQL enum variables', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ contactTrends: { period: '7days', data: [] } })
      .mockResolvedValueOnce({ dealPerformance: { period: '12months', metrics: {} } })
      .mockResolvedValueOnce({ communicationStats: { period: '90days', email: {}, sms: {} } });

    await getContactTrendsViaGraphql('7days', 4);
    await getDealPerformanceViaGraphql('12months', 4);
    await getCommunicationStatsViaGraphql('90days', 4);

    expect(graphqlRequest).toHaveBeenNthCalledWith(1, expect.stringContaining('query ContactTrends'), { period: 'DAYS_7' }, 4);
    expect(graphqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('query DealPerformance'), { period: 'MONTHS_12' }, 4);
    expect(graphqlRequest).toHaveBeenNthCalledWith(3, expect.stringContaining('query CommunicationStats'), { period: 'DAYS_90' }, 4);
  });

  it('returns booking and workflow payloads without lossy remapping', async () => {
    const booking = { total: 2, completed: 1, completionRate: 100 };
    const workflow = { workflows: [], summary: { totalWorkflows: 0 } };
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ bookingAnalytics: booking })
      .mockResolvedValueOnce({ workflowPerformance: workflow });

    await expect(getBookingAnalyticsViaGraphql(4)).resolves.toBe(booking);
    await expect(getWorkflowPerformanceViaGraphql(4)).resolves.toBe(workflow);
    expect(graphqlRequest).toHaveBeenNthCalledWith(1, expect.stringContaining('query BookingAnalytics'), {}, 4);
    expect(graphqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('query WorkflowPerformance'), {}, 4);
  });
});
