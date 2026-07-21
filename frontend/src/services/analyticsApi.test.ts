import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  getBookingSummary,
  getCommunicationStats,
  getContactTrends,
  getDashboardAnalytics,
  getDealPerformance,
  getWorkflowPerformance,
} from './analyticsApi';
import {
  getBookingAnalyticsViaGraphql,
  getCommunicationStatsViaGraphql,
  getContactTrendsViaGraphql,
  getDashboardAnalyticsViaGraphql,
  getDealPerformanceViaGraphql,
  getWorkflowPerformanceViaGraphql,
} from './analyticsGraphql';
import {
  isBookingAnalyticsGraphqlEnabled,
  isCommunicationStatsGraphqlEnabled,
  isContactTrendsGraphqlEnabled,
  isDashboardAnalyticsGraphqlEnabled,
  isDealPerformanceGraphqlEnabled,
  isWorkflowPerformanceGraphqlEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('./analyticsGraphql', () => ({
  getDashboardAnalyticsViaGraphql: vi.fn(),
  getContactTrendsViaGraphql: vi.fn(),
  getDealPerformanceViaGraphql: vi.fn(),
  getBookingAnalyticsViaGraphql: vi.fn(),
  getCommunicationStatsViaGraphql: vi.fn(),
  getWorkflowPerformanceViaGraphql: vi.fn(),
}));
vi.mock('./graphqlClient', () => ({
  isDashboardAnalyticsGraphqlEnabled: vi.fn(),
  isContactTrendsGraphqlEnabled: vi.fn(),
  isDealPerformanceGraphqlEnabled: vi.fn(),
  isBookingAnalyticsGraphqlEnabled: vi.fn(),
  isCommunicationStatsGraphqlEnabled: vi.fn(),
  isWorkflowPerformanceGraphqlEnabled: vi.fn(),
}));

const result = {
  contacts: { total: 0, active: 0, leads: 0, customers: 0, newThisMonth: 0, newThisWeek: 0, growth: [] },
  deals: { total: 0, open: 0, won: 0, lost: 0, openValue: 0, wonValue: 0, wonThisMonth: 0, funnel: [] },
  bookings: { total: 0, confirmed: 0, pending: 0, cancelled: 0, upcomingThisWeek: 0, upcomingToday: 0 },
  tasks: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
  pipelines: { total: 0 },
  recentActivity: [],
};

describe('dashboard analytics transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDashboardAnalyticsGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isContactTrendsGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isDealPerformanceGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isBookingAnalyticsGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isCommunicationStatsGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isWorkflowPerformanceGraphqlEnabled).mockReturnValue(false);
  });

  it('keeps the dashboard read on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: result } });
    await expect(getDashboardAnalytics(4)).resolves.toEqual(result);
    expect(api.get).toHaveBeenCalledWith('/api/analytics/dashboard', {
      headers: { 'x-organization-id': '4' },
    });
    expect(getDashboardAnalyticsViaGraphql).not.toHaveBeenCalled();
  });

  it('routes only the dashboard read through GraphQL when enabled', async () => {
    vi.mocked(isDashboardAnalyticsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(getDashboardAnalyticsViaGraphql).mockResolvedValue(result);
    await expect(getDashboardAnalytics(4)).resolves.toEqual(result);
    expect(getDashboardAnalyticsViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps each newly implemented analytics read on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: {} } });
    await getContactTrends('7days', 4);
    await getDealPerformance('12months', 4);
    await getBookingSummary(4);
    await getCommunicationStats('90days', 4);
    await getWorkflowPerformance(4);

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/analytics/contacts/trends', {
      params: { period: '7days' }, headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/analytics/deals/performance', {
      params: { period: '12months' }, headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(3, '/api/analytics/bookings/summary', {
      headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(4, '/api/analytics/communication-stats', {
      params: { period: '90days' }, headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(5, '/api/analytics/workflow-performance', {
      headers: { 'x-organization-id': '4' },
    });
  });

  it('canary-routes each new read independently through GraphQL', async () => {
    vi.mocked(isContactTrendsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isDealPerformanceGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isBookingAnalyticsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isCommunicationStatsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isWorkflowPerformanceGraphqlEnabled).mockReturnValue(true);
    vi.mocked(getContactTrendsViaGraphql).mockResolvedValue({ period: '7days', data: [] });
    vi.mocked(getDealPerformanceViaGraphql).mockResolvedValue({
      period: '12months',
      metrics: { closedTotal: 0, wonCount: 0, lostCount: 0, winRate: 0, avgDealValue: 0, totalRevenue: 0, avgDaysToClose: 0 },
    });
    vi.mocked(getBookingAnalyticsViaGraphql).mockResolvedValue({
      total: 0, confirmed: 0, completed: 0, cancelled: 0, noShow: 0,
      createdThisMonth: 0, upcoming: 0, completionRate: 0,
    });
    vi.mocked(getCommunicationStatsViaGraphql).mockResolvedValue({
      period: '90days',
      email: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, rates: { delivery: 0, open: 0, click: 0 } },
      sms: { total: 0, outbound: 0, inbound: 0, sent: 0, delivered: 0, failed: 0, segments: 0, rates: { delivery: 0 } },
    });
    vi.mocked(getWorkflowPerformanceViaGraphql).mockResolvedValue({
      workflows: [],
      summary: { totalWorkflows: 0, activeWorkflows: 0, totalEnrollments: 0, completedEnrollments: 0, activeEnrollments: 0, failedEnrollments: 0, overallCompletionRate: 0 },
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
    expect(api.get).not.toHaveBeenCalled();
  });
});
