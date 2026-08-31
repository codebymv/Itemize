import { useQuery } from '@tanstack/react-query';
import { useOrganizationContext } from '@/contexts/organization-context';
import {
  getOrganizationBootstrapViaGraphql,
  organizationBootstrapQueryKey,
} from '@/services/organizationBootstrapGraphql';

export function useOrganizationBootstrap(enabled = true) {
  const { organizationId } = useOrganizationContext();

  return useQuery({
    queryKey: organizationBootstrapQueryKey(organizationId),
    queryFn: ({ signal }) => getOrganizationBootstrapViaGraphql(
      organizationId as number,
      signal,
    ),
    enabled: enabled && organizationId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
