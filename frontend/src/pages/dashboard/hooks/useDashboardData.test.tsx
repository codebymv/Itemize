import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAnalytics } from '@/services/analyticsApi';
import * as dashboardGraphql from '@/services/analyticsGraphql';
import {
  hasMeaningfulDashboardActivity,
  useDashboardData,
} from './useDashboardData';

vi.mock('@/services/analyticsGraphql', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/analyticsGraphql')>(),
  getDashboardSnapshotViaGraphql: vi.fn(),
}));

const emptyAnalytics: DashboardAnalytics = {
  contacts: {
    total: 0,
    active: 0,
    newThisMonth: 0,
    newThisWeek: 0,
    growth: [],
    recentContacts: [],
  },
  deals: { total: 0, open: 0, won: 0, lost: 0, funnel: [] },
  bookings: {
    total: 0, confirmed: 0, pending: 0, cancelled: 0,
    upcomingThisWeek: 0, upcomingToday: 0,
  },
  tasks: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
  pipelines: { total: 2 },
  recentActivity: [],
  invoiceMetrics: {
    pending: 0, overdue: 0, paidThisMonth: 0, countThisMonth: 0,
    recentInvoices: [],
  },
  signatureMetrics: { awaiting: 0, signedThisWeek: 0, total: 0, recentDocuments: [] },
  workspaceMetrics: { activeItems: 0, lists: 0, notes: 0, recentItems: [] },
};

const snapshot = {
  analytics: emptyAnalytics,
  conversions: { period: '30days' },
  communications: { period: '30days' },
  pipelineDealAge: { pipeline: null },
  revenue: { period: '30days' },
} as dashboardGraphql.DashboardSnapshot;

describe('useDashboardData', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardGraphql.getDashboardSnapshotViaGraphql).mockResolvedValue(snapshot);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('does not treat default pipelines as meaningful activity', () => {
    expect(hasMeaningfulDashboardActivity(emptyAnalytics)).toBe(false);
    expect(hasMeaningfulDashboardActivity({
      ...emptyAnalytics,
      workspaceMetrics: { ...emptyAnalytics.workspaceMetrics!, activeItems: 1 },
    })).toBe(true);
  });

  it('loads the complete route read model with one request', async () => {
    const { result } = renderHook(
      () => useDashboardData({ organizationId: 7 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.analytics).toEqual(emptyAnalytics));
    expect(result.current.revenue).toBe(snapshot.revenue);
    expect(result.current.conversions).toBe(snapshot.conversions);
    expect(dashboardGraphql.getDashboardSnapshotViaGraphql).toHaveBeenCalledTimes(1);
    expect(dashboardGraphql.getDashboardSnapshotViaGraphql).toHaveBeenCalledWith(
      '30days',
      7,
      expect.any(AbortSignal),
    );
  });

  it('uses the selected performance period as part of the snapshot key', async () => {
    const { rerender } = renderHook(
      ({ period }: { period: dashboardGraphql.DashboardPeriod }) => (
        useDashboardData({ organizationId: 7, period })
      ),
      { initialProps: { period: '7days' as dashboardGraphql.DashboardPeriod }, wrapper },
    );

    await waitFor(() => expect(
      dashboardGraphql.getDashboardSnapshotViaGraphql,
    ).toHaveBeenCalledWith('7days', 7, expect.any(AbortSignal)));

    rerender({ period: '90days' });
    await waitFor(() => expect(
      dashboardGraphql.getDashboardSnapshotViaGraphql,
    ).toHaveBeenCalledWith('90days', 7, expect.any(AbortSignal)));
    expect(dashboardGraphql.getDashboardSnapshotViaGraphql).toHaveBeenCalledTimes(2);
  });

  it('does not fetch before organization scope is available', () => {
    renderHook(() => useDashboardData({}), { wrapper });
    expect(dashboardGraphql.getDashboardSnapshotViaGraphql).not.toHaveBeenCalled();
  });
});
