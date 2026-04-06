/**
 * useBillingStatus Hook
 * 
 * React Query hook for fetching billing status data.
 * Provides caching, automatic refetching, and error handling.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getBillingStatus, type BillingStatus } from '@/services/billingApi';

/**
 * Fetch billing status with React Query
 * 
 * Features:
 * - 5-minute stale time for caching
 * - Automatic refetch on window focus
 * - Error handling with typed errors
 * - Loading states
 */
export function useBillingStatus(): UseQueryResult<BillingStatus, Error> {
  return useQuery({
    queryKey: ['billing', 'status'],
    queryFn: async () => {
      const result = await getBillingStatus();
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch billing status');
      }
      
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}
