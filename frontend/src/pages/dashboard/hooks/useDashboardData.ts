/**
 * Hook for fetching all dashboard analytics data
 * Consolidates multiple API calls with React Query
 */

import { useQuery } from '@tanstack/react-query';
import type {
  DashboardAnalytics,
  ConversionRates,
  CommunicationStats,
  PipelineDealAge,
} from '@/services/analyticsApi';
import {
  getDashboardSnapshotViaGraphql,
  type DashboardPeriod,
} from '@/services/analyticsGraphql';
import type { RevenueFlow } from '@/services/invoicePaymentsApi';

interface UseDashboardDataParams {
  organizationId?: number;
  period?: DashboardPeriod;
}

interface UseDashboardDataReturn {
  // Data
  analytics: DashboardAnalytics | undefined;
  conversions: ConversionRates | undefined;
  communications: CommunicationStats | undefined;
  pipelineDealAge: PipelineDealAge | undefined;
  revenue: RevenueFlow | undefined;
  
  // Loading states
  isLoadingAnalytics: boolean;
  isLoadingConversions: boolean;
  isLoadingCommunications: boolean;
  isLoadingPipelineDealAge: boolean;
  isLoadingRevenue: boolean;
  
  // Error states
  analyticsError: Error | null;
  conversionsError: Error | null;
  communicationsError: Error | null;
  pipelineDealAgeError: Error | null;
  revenueError: Error | null;
  
  // Refetch functions
  refetchAll: () => void;
}

/** Default pipeline configuration is not evidence of workspace activity. */
export function hasMeaningfulDashboardActivity(
  analytics: DashboardAnalytics | undefined,
): boolean {
  if (!analytics) return false;

  const invoices = analytics.invoiceMetrics;
  const signatures = analytics.signatureMetrics;
  const workspace = analytics.workspaceMetrics;

  return (
    analytics.contacts.total > 0
    || analytics.deals.total > 0
    || analytics.bookings.total > 0
    || analytics.tasks.total > 0
    || Boolean(invoices && (
      invoices.pending > 0
      || invoices.overdue > 0
      || invoices.paidThisMonth > 0
      || invoices.countThisMonth > 0
      || invoices.recentInvoices.length > 0
    ))
    || Boolean(signatures && (
      signatures.awaiting > 0
      || signatures.signedThisWeek > 0
      || signatures.total > 0
      || signatures.recentDocuments.length > 0
    ))
    || Boolean(workspace && (
      workspace.activeItems > 0
      || workspace.lists > 0
      || workspace.notes > 0
      || workspace.recentItems.length > 0
    ))
  );
}

export function useDashboardData({
  organizationId,
  period = '30days',
}: UseDashboardDataParams): UseDashboardDataReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-snapshot', organizationId, period],
    queryFn: ({ signal }) => getDashboardSnapshotViaGraphql(
      period,
      organizationId as number,
      signal,
    ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const refetchAll = () => {
    void refetch();
  };

  return {
    analytics: data?.analytics,
    conversions: data?.conversions,
    communications: data?.communications,
    pipelineDealAge: data?.pipelineDealAge,
    revenue: data?.revenue,
    isLoadingAnalytics: isLoading,
    isLoadingConversions: isLoading,
    isLoadingCommunications: isLoading,
    isLoadingPipelineDealAge: isLoading,
    isLoadingRevenue: isLoading,
    analyticsError: error as Error | null,
    conversionsError: error as Error | null,
    communicationsError: error as Error | null,
    pipelineDealAgeError: error as Error | null,
    revenueError: error as Error | null,
    refetchAll,
  };
}
