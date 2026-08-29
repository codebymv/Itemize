/**
 * Hook for fetching all dashboard analytics data
 * Consolidates multiple API calls with React Query
 */

import { useQuery } from '@tanstack/react-query';
import {
  getDashboardAnalytics,
  getConversionRates,
  getCommunicationStats,
  getPipelineDealAge,
  type DashboardAnalytics,
  type ConversionRates,
  type CommunicationStats,
  type PipelineDealAge,
} from '@/services/analyticsApi';
import { getRevenueFlow, type RevenueFlow } from '@/services/invoicePaymentsApi';

interface UseDashboardDataParams {
  organizationId?: number;
  period?: '7days' | '30days' | '90days' | '6months' | '12months';
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
  const conversionPeriod = period === '6months' ? '30days' : period;
  const communicationPeriod = period === '6months' || period === '12months' ? '30days' : period;

  // Main analytics query
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['dashboard-analytics', organizationId],
    queryFn: () =>
      getDashboardAnalytics(organizationId),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const shouldLoadSecondary = Boolean(
    organizationId && hasMeaningfulDashboardActivity(analytics),
  );

  // Conversion rates query
  const {
    data: conversions,
    isLoading: isLoadingConversions,
    error: conversionsError,
    refetch: refetchConversions,
  } = useQuery({
    queryKey: ['conversion-rates', period, organizationId],
    queryFn: () =>
      getConversionRates(conversionPeriod, organizationId),
    enabled: shouldLoadSecondary,
    staleTime: 5 * 60 * 1000,
  });

  // Communication stats query
  const {
    data: communications,
    isLoading: isLoadingCommunications,
    error: communicationsError,
    refetch: refetchCommunications,
  } = useQuery({
    queryKey: ['communication-stats', period, organizationId],
    queryFn: () =>
      getCommunicationStats(communicationPeriod, organizationId),
    enabled: shouldLoadSecondary,
    staleTime: 5 * 60 * 1000,
  });

  // Current open-deal age query
  const {
    data: pipelineDealAge,
    isLoading: isLoadingPipelineDealAge,
    error: pipelineDealAgeError,
    refetch: refetchPipelineDealAge,
  } = useQuery({
    queryKey: ['pipeline-deal-age', organizationId],
    queryFn: () =>
      getPipelineDealAge(undefined, organizationId),
    enabled: shouldLoadSecondary,
    staleTime: 5 * 60 * 1000,
  });

  // Revenue trends query
  const {
    data: revenue,
    isLoading: isLoadingRevenue,
    error: revenueError,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ['revenue-flow', period, organizationId],
    queryFn: () =>
      getRevenueFlow(organizationId!, period),
    // Revenue is a first-class signal in its own right. Standalone payments can
    // exist even when the CRM analytics snapshot has no contacts or deals.
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Refetch all data
  const refetchAll = () => {
    void refetchAnalytics();
    if (organizationId) void refetchRevenue();
    if (shouldLoadSecondary) {
      void refetchConversions();
      void refetchCommunications();
      void refetchPipelineDealAge();
    }
  };

  return {
    // Data
    analytics: analytics || undefined,
    conversions: shouldLoadSecondary ? conversions || undefined : undefined,
    communications: shouldLoadSecondary ? communications || undefined : undefined,
    pipelineDealAge: shouldLoadSecondary ? pipelineDealAge || undefined : undefined,
    revenue: revenue || undefined,
    
    // Loading states
    isLoadingAnalytics,
    isLoadingConversions: shouldLoadSecondary && isLoadingConversions,
    isLoadingCommunications: shouldLoadSecondary && isLoadingCommunications,
    isLoadingPipelineDealAge: shouldLoadSecondary && isLoadingPipelineDealAge,
    isLoadingRevenue,
    
    // Error states
    analyticsError: analyticsError as Error | null,
    conversionsError: shouldLoadSecondary ? conversionsError as Error | null : null,
    communicationsError: shouldLoadSecondary ? communicationsError as Error | null : null,
    pipelineDealAgeError: shouldLoadSecondary ? pipelineDealAgeError as Error | null : null,
    revenueError: revenueError as Error | null,
    
    // Refetch
    refetchAll,
  };
}
