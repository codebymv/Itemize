import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBookingSummary,
  getCommunicationStats,
  getContactTrends,
  getConversionRates,
  getDashboardAnalytics,
  getDealPerformance,
  getPipelineDealAge,
  getRevenueTrends,
  getWorkflowPerformance,
} from './analyticsApi';
import {
  getBookingAnalyticsViaGraphql,
  getCommunicationStatsViaGraphql,
  getContactTrendsViaGraphql,
  getDashboardAnalyticsViaGraphql,
  getDealPerformanceViaGraphql,
  getConversionRatesViaGraphql,
  getPipelineDealAgeViaGraphql,
  getRevenueTrendsViaGraphql,
  getWorkflowPerformanceViaGraphql,
} from './analyticsGraphql';

vi.mock('./analyticsGraphql', () => ({
  getDashboardAnalyticsViaGraphql: vi.fn(),
  getContactTrendsViaGraphql: vi.fn(),
  getDealPerformanceViaGraphql: vi.fn(),
  getBookingAnalyticsViaGraphql: vi.fn(),
  getCommunicationStatsViaGraphql: vi.fn(),
  getConversionRatesViaGraphql: vi.fn(),
  getRevenueTrendsViaGraphql: vi.fn(),
  getPipelineDealAgeViaGraphql: vi.fn(),
  getWorkflowPerformanceViaGraphql: vi.fn(),
}));

const dashboard = {
  contacts: {
    total: 0,
    active: 0,
    newThisMonth: 0,
    newThisWeek: 0,
    growth: [],
    recentContacts: [],
  },
  deals: {
    total: 0,
    open: 0,
    won: 0,
    lost: 0,
    funnel: [],
  },
  bookings: {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    upcomingThisWeek: 0,
    upcomingToday: 0,
  },
  tasks: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
  pipelines: { total: 0 },
  recentActivity: [],
};

describe('analytics transport boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always delegates the dashboard snapshot to GraphQL', async () => {
    vi.mocked(getDashboardAnalyticsViaGraphql).mockResolvedValue(dashboard);

    await expect(getDashboardAnalytics(4)).resolves.toBe(dashboard);
    expect(getDashboardAnalyticsViaGraphql).toHaveBeenCalledWith(4);
  });

  it('always delegates the five approved dedicated reads to GraphQL', async () => {
    vi.mocked(getContactTrendsViaGraphql).mockResolvedValue({
      period: '7days',
      data: [],
    });
    vi.mocked(getDealPerformanceViaGraphql).mockResolvedValue({
      period: '12months',
      metrics: {
        closedTotal: 0,
        wonCount: 0,
        lostCount: 0,
        winRate: 0,
        avgDealValue: 0,
        totalRevenue: 0,
        avgDaysToClose: 0,
      },
    });
    vi.mocked(getBookingAnalyticsViaGraphql).mockResolvedValue({
      total: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      createdThisMonth: 0,
      upcoming: 0,
      completionRate: 0,
    });
    vi.mocked(getCommunicationStatsViaGraphql).mockResolvedValue({
      period: '90days',
      email: {
        total: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        failed: 0,
        rates: { delivery: 0, open: 0, click: 0 },
      },
      sms: {
        total: 0,
        outbound: 0,
        inbound: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        segments: 0,
        rates: { delivery: 0 },
      },
    });
    vi.mocked(getWorkflowPerformanceViaGraphql).mockResolvedValue({
      workflows: [],
      summary: {
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalEnrollments: 0,
        completedEnrollments: 0,
        activeEnrollments: 0,
        failedEnrollments: 0,
        overallCompletionRate: 0,
      },
    });

    await getContactTrends('7days', 4);
    await getDealPerformance('12months', 4);
    await getBookingSummary(4);
    await getCommunicationStats('90days', 4);
    await getWorkflowPerformance(4);

    expect(getContactTrendsViaGraphql).toHaveBeenCalledWith('7days', 4);
    expect(getDealPerformanceViaGraphql).toHaveBeenCalledWith('12months', 4);
    expect(getBookingAnalyticsViaGraphql).toHaveBeenCalledWith(4);
    expect(getCommunicationStatsViaGraphql).toHaveBeenCalledWith('90days', 4);
    expect(getWorkflowPerformanceViaGraphql).toHaveBeenCalledWith(4);
  });

  it('delegates the corrected conversion, revenue, and deal-age reads to GraphQL', async () => {
    const conversion = {
      period: '30days',
      dealWinRate: { rate: 0, won: 0, lost: 0, totalClosed: 0, valuesByCurrency: [] },
      formToContact: { rate: 0, submissions: 0, converted: 0 },
    };
    const revenue = { period: '6months', currencies: [] };
    const dealAge = {
      pipeline: null,
      stages: [],
      summary: {
        averageDaysToWin: 0,
        averageDaysToLose: 0,
        openDeals: 0,
        wonDeals: 0,
        lostDeals: 0,
        winRate: 0,
      },
    };
    vi.mocked(getConversionRatesViaGraphql).mockResolvedValue(conversion);
    vi.mocked(getRevenueTrendsViaGraphql).mockResolvedValue(revenue);
    vi.mocked(getPipelineDealAgeViaGraphql).mockResolvedValue(dealAge);

    await expect(getConversionRates('30days', 4)).resolves.toBe(conversion);
    await expect(getRevenueTrends('6months', 4)).resolves.toBe(revenue);
    await expect(getPipelineDealAge(17, 4)).resolves.toBe(dealAge);

    expect(getConversionRatesViaGraphql).toHaveBeenCalledWith('30days', 4);
    expect(getRevenueTrendsViaGraphql).toHaveBeenCalledWith('6months', 4);
    expect(getPipelineDealAgeViaGraphql).toHaveBeenCalledWith(17, 4);
  });
});
