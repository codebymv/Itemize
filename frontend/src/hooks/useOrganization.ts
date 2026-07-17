import { useMemo } from 'react';
import { useOrganizationContext } from '@/contexts/organization-context';
import { Organization } from '@/types';

interface UseOrganizationOptions {
  autoInit?: boolean;
  onError?: (error: unknown) => string | void;
}

interface UseOrganizationResult {
  organizationId: number | null;
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<Organization | null>;
}

export const useOrganization = (options: UseOrganizationOptions = {}): UseOrganizationResult => {
  const { autoInit = true, onError } = options;
  const context = useOrganizationContext();
  const error = useMemo(() => {
    if (!context.error) return null;
    const customMessage = onError?.(context.error);
    return typeof customMessage === 'string'
      ? customMessage
      : 'Failed to initialize organization. Please check your connection.';
  }, [context.error, onError]);

  return {
    organizationId: autoInit ? context.organizationId : null,
    organization: autoInit ? context.organization : null,
    isLoading: autoInit ? context.isLoading : false,
    error,
    refresh: context.refresh,
  };
};
