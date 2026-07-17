import { createContext, useContext } from 'react';
import type { Organization } from '@/types';

export interface OrganizationContextValue {
  organizations: Organization[];
  organization: Organization | null;
  organizationId: number | null;
  isLoading: boolean;
  isSwitching: boolean;
  error: unknown;
  refresh: () => Promise<Organization | null>;
  selectOrganization: (organizationId: number) => Promise<Organization>;
}

export const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export const useOrganizationContext = (): OrganizationContextValue => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganizationContext must be used within an OrganizationProvider');
  }
  return context;
};
