/**
 * Hook for fetching all dashboard analytics data
 * Consolidates multiple API calls with React Query
 */

import { useQuery } from '@tanstack/react-query';
import {
  getDashboardAnalytics,
  getConversionRates,
  getCommunicationStats,
  getPipelineVelocity,
  getRevenueTrends,
  type DashboardAnalytics,
  type ConversionRates,
  type CommunicationStats,
  type PipelineVelocity,
  type RevenueTrends,
} from '@/services/analyticsApi';

interface UseDashboardDataParams {
  organizationId?: number;
  period?: string;
}

interface UseDashboardDataReturn {
  // Data
  analytics: DashboardAnalytics | undefined;
  conversions: ConversionRates | undefined;
  communications: CommunicationStats | undefined;
  velocity: PipelineVelocity | undefined;
  revenue: RevenueTrends | undefined;
  
  // Loading states
  isLoadingAnalytics: boolean;
  isLoadingConversions: boolean;
  isLoadingCommunications: boolean;
  isLoadingVelocity: boolean;
  isLoadingRevenue: boolean;
  
  // Error states
  analyticsError: Error | null;
  conversionsError: Error | null;
  communicationsError: Error | null;
  velocityError: Error | null;
  revenueError: Error | null;
  
  // Refetch functions
  refetchAll: () => void;
}

export function useDashboardData({
  organizationId,
  period = '30days',
}: UseDashboardDataParams): UseDashboardDataReturn {
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
      getConversionRates(period as any, organizationId),
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
      getCommunicationStats(period as any, organizationId),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Pipeline velocity query
  const {
    data: velocity,
    isLoading: isLoadingVelocity,
    error: velocityError,
    refetch: refetchVelocity,
  } = useQuery({
    queryKey: ['pipeline-velocity', organizationId],
    queryFn: () =>
      getPipelineVelocity(undefined, organizationId),
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
      getRevenueTrends(period as any, organizationId),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Refetch all data
  const refetchAll = () => {
    refetchAnalytics();
    refetchConversions();
    refetchCommunications();
    refetchVelocity();
    refetchRevenue();
  };

  return {
    // Data
    analytics: analytics || undefined,
    conversions: conversions || undefined,
    communications: communications || undefined,
    velocity: velocity || undefined,
    revenue: revenue || undefined,
    
    // Loading states
    isLoadingAnalytics,
    isLoadingConversions,
    isLoadingCommunications,
    isLoadingVelocity,
    isLoadingRevenue,
    
    // Error states
    analyticsError: analyticsError as Error | null,
    conversionsError: conversionsError as Error | null,
    communicationsError: communicationsError as Error | null,
    velocityError: velocityError as Error | null,
    revenueError: revenueError as Error | null,
    
    // Refetch
    refetchAll,
  };
}
