import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureDefaultOrganization } from '@/services/contactsApi';
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
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const org = await ensureDefaultOrganization();
      setOrganization(org);
      setError(null);
      return org;
    } catch (err) {
      const defaultMessage = 'Failed to initialize organization. Please check your connection.';
      const customMessage = onErrorRef.current ? onErrorRef.current(err) : null;
      const message = typeof customMessage === 'string' ? customMessage : defaultMessage;
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoInit) {
      refresh();
    }
  }, [autoInit, refresh]);

  return {
    organizationId: organization?.id ?? null,
    organization,
    isLoading,
    error,
    refresh
  };
};
