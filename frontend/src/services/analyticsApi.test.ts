import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getDashboardAnalytics } from './analyticsApi';
import { getDashboardAnalyticsViaGraphql } from './analyticsGraphql';
import { isDashboardAnalyticsGraphqlEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('./analyticsGraphql', () => ({ getDashboardAnalyticsViaGraphql: vi.fn() }));
vi.mock('./graphqlClient', () => ({ isDashboardAnalyticsGraphqlEnabled: vi.fn() }));

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
});
