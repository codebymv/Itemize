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
  getRevenueTrends,
  type DashboardAnalytics,
  type ConversionRates,
  type CommunicationStats,
  type PipelineDealAge,
  type RevenueTrends,
} from '@/services/analyticsApi';

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
  revenue: RevenueTrends | undefined;
  
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

export function useDashboardData({
  organizationId,
  period = '30days',
}: UseDashboardDataParams): UseDashboardDataReturn {
  const conversionPeriod = period === '6months' ? '30days' : period;
  const communicationPeriod = period === '6months' || period === '12months' ? '30days' : period;
  const revenuePeriod = period === '7days' || period === '90days' ? '30days' : period;

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
    enabled: !!organizationId,
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
    enabled: !!organizationId,
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
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Revenue trends query
  const {
    data: revenue,
    isLoading: isLoadingRevenue,
    error: revenueError,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ['revenue-trends', period, organizationId],
    queryFn: () =>
      getRevenueTrends(revenuePeriod, organizationId),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Refetch all data
  const refetchAll = () => {
    refetchAnalytics();
    refetchConversions();
    refetchCommunications();
    refetchPipelineDealAge();
    refetchRevenue();
  };

  return {
    // Data
    analytics: analytics || undefined,
    conversions: conversions || undefined,
    communications: communications || undefined,
    pipelineDealAge: pipelineDealAge || undefined,
    revenue: revenue || undefined,
    
    // Loading states
    isLoadingAnalytics,
    isLoadingConversions,
    isLoadingCommunications,
    isLoadingPipelineDealAge,
    isLoadingRevenue,
    
    // Error states
    analyticsError: analyticsError as Error | null,
    conversionsError: conversionsError as Error | null,
    communicationsError: communicationsError as Error | null,
    pipelineDealAgeError: pipelineDealAgeError as Error | null,
    revenueError: revenueError as Error | null,
    
    // Refetch
    refetchAll,
  };
}
