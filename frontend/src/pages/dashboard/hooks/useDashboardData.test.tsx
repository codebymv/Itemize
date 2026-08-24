import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as analyticsApi from '@/services/analyticsApi';
import {
  hasMeaningfulDashboardActivity,
  useDashboardData,
} from './useDashboardData';

vi.mock('@/services/analyticsApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/analyticsApi')>(),
  getDashboardAnalytics: vi.fn(),
  getConversionRates: vi.fn(),
  getCommunicationStats: vi.fn(),
  getPipelineDealAge: vi.fn(),
  getRevenueTrends: vi.fn(),
}));

const emptyAnalytics: analyticsApi.DashboardAnalytics = {
  contacts: { total: 0, active: 0, newThisMonth: 0, newThisWeek: 0, growth: [] },
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

describe('useDashboardData', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('defers secondary reports for an empty workspace', async () => {
    vi.mocked(analyticsApi.getDashboardAnalytics).mockResolvedValue(emptyAnalytics);
    queryClient.setQueryData(['conversion-rates', '30days', 7], { period: '30days' });

    const { result } = renderHook(
      () => useDashboardData({ organizationId: 7 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.analytics).toEqual(emptyAnalytics));
    expect(result.current.conversions).toBeUndefined();
    expect(analyticsApi.getDashboardAnalytics).toHaveBeenCalledWith(7);
    expect(analyticsApi.getConversionRates).not.toHaveBeenCalled();
    expect(analyticsApi.getCommunicationStats).not.toHaveBeenCalled();
    expect(analyticsApi.getPipelineDealAge).not.toHaveBeenCalled();
    expect(analyticsApi.getRevenueTrends).not.toHaveBeenCalled();
  });

  it('loads secondary reports after the workspace has activity', async () => {
    vi.mocked(analyticsApi.getDashboardAnalytics).mockResolvedValue({
      ...emptyAnalytics,
      contacts: { ...emptyAnalytics.contacts, total: 1 },
    });
    vi.mocked(analyticsApi.getConversionRates).mockResolvedValue({} as analyticsApi.ConversionRates);
    vi.mocked(analyticsApi.getCommunicationStats).mockResolvedValue({} as analyticsApi.CommunicationStats);
    vi.mocked(analyticsApi.getPipelineDealAge).mockResolvedValue({} as analyticsApi.PipelineDealAge);
    vi.mocked(analyticsApi.getRevenueTrends).mockResolvedValue({} as analyticsApi.RevenueTrends);

    renderHook(() => useDashboardData({ organizationId: 7 }), { wrapper });

    await waitFor(() => expect(analyticsApi.getRevenueTrends).toHaveBeenCalled());
    expect(analyticsApi.getConversionRates).toHaveBeenCalledWith('30days', 7);
    expect(analyticsApi.getCommunicationStats).toHaveBeenCalledWith('30days', 7);
    expect(analyticsApi.getPipelineDealAge).toHaveBeenCalledWith(undefined, 7);
    expect(analyticsApi.getRevenueTrends).toHaveBeenCalledWith('30days', 7);
  });
});
