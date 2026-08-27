/**
 * useUsageStats Hook
 * 
 * React Query hook for fetching usage statistics data.
 * Provides caching, automatic refetching, and error handling.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useOrganizationContext } from '@/contexts/organization-context';
import { getUsageStats, type UsageStats } from '@/services/billingApi';

/**
 * Fetch usage statistics with React Query
 * 
 * Features:
 * - 5-minute stale time for caching
 * - Automatic refetch on window focus
 * - Error handling with typed errors
 * - Loading states
 */
export function useUsageStats(): UseQueryResult<UsageStats, Error> {
  const { organizationId } = useOrganizationContext();

  return useQuery({
    queryKey: ['billing', 'usage', organizationId],
    queryFn: async () => {
      const result = await getUsageStats();
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch usage statistics');
      }
      
      return result.data;
    },
    enabled: organizationId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}
