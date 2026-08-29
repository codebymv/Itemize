import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as analyticsApi from '@/services/analyticsApi';
import * as paymentsApi from '@/services/invoicePaymentsApi';
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
}));

vi.mock('@/services/invoicePaymentsApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/invoicePaymentsApi')>(),
  getRevenueFlow: vi.fn(),
}));

const emptyAnalytics: analyticsApi.DashboardAnalytics = {
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

describe('useDashboardData', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentsApi.getRevenueFlow).mockResolvedValue({} as paymentsApi.RevenueFlow);
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

  it('defers CRM reports but still loads first-class revenue for an empty workspace', async () => {
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
    expect(paymentsApi.getRevenueFlow).toHaveBeenCalledWith(7, '30days');
  });

  it('loads secondary reports after the workspace has activity', async () => {
    vi.mocked(analyticsApi.getDashboardAnalytics).mockResolvedValue({
      ...emptyAnalytics,
      contacts: { ...emptyAnalytics.contacts, total: 1 },
    });
    vi.mocked(analyticsApi.getConversionRates).mockResolvedValue({} as analyticsApi.ConversionRates);
    vi.mocked(analyticsApi.getCommunicationStats).mockResolvedValue({} as analyticsApi.CommunicationStats);
    vi.mocked(analyticsApi.getPipelineDealAge).mockResolvedValue({} as analyticsApi.PipelineDealAge);
    vi.mocked(paymentsApi.getRevenueFlow).mockResolvedValue({} as paymentsApi.RevenueFlow);

    renderHook(() => useDashboardData({ organizationId: 7 }), { wrapper });

    await waitFor(() => expect(analyticsApi.getConversionRates).toHaveBeenCalled());
    expect(analyticsApi.getConversionRates).toHaveBeenCalledWith('30days', 7);
    expect(analyticsApi.getCommunicationStats).toHaveBeenCalledWith('30days', 7);
    expect(analyticsApi.getPipelineDealAge).toHaveBeenCalledWith(undefined, 7);
    expect(paymentsApi.getRevenueFlow).toHaveBeenCalledWith(7, '30days');
  });

  it('does not substitute 30-day revenue when the dashboard uses 7 days', async () => {
    vi.mocked(analyticsApi.getDashboardAnalytics).mockResolvedValue({
      ...emptyAnalytics,
      contacts: { ...emptyAnalytics.contacts, total: 1 },
    });
    vi.mocked(analyticsApi.getConversionRates).mockResolvedValue({} as analyticsApi.ConversionRates);
    vi.mocked(analyticsApi.getCommunicationStats).mockResolvedValue({} as analyticsApi.CommunicationStats);
    vi.mocked(analyticsApi.getPipelineDealAge).mockResolvedValue({} as analyticsApi.PipelineDealAge);
    vi.mocked(paymentsApi.getRevenueFlow).mockResolvedValue({} as paymentsApi.RevenueFlow);

    renderHook(() => useDashboardData({ organizationId: 7, period: '7days' }), { wrapper });

    await waitFor(() => expect(paymentsApi.getRevenueFlow).toHaveBeenCalledWith(7, '7days'));
  });
});
