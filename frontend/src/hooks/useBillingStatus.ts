/**
 * Billing selector over the shared selected-organization bootstrap.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useOrganizationContext } from '@/contexts/organization-context';
import type { BillingStatus } from '@/services/billingApi';
import {
  getOrganizationBootstrapViaGraphql,
  organizationBootstrapQueryKey,
  type OrganizationBootstrap,
} from '@/services/organizationBootstrapGraphql';

/**
 * Every consumer observes the same organization-scoped request as onboarding
 * and get-started while retaining the established billing hook contract.
 */
export function useBillingStatus(): UseQueryResult<BillingStatus, Error> {
  const { organizationId } = useOrganizationContext();

  return useQuery<OrganizationBootstrap, Error, BillingStatus>({
    queryKey: organizationBootstrapQueryKey(organizationId),
    queryFn: ({ signal }) => getOrganizationBootstrapViaGraphql(
      organizationId as number,
      signal,
    ),
    enabled: organizationId !== null,
    staleTime: 5 * 60 * 1000,
    select: (bootstrap) => bootstrap.billingStatus,
  });
}
