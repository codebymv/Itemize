import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthState } from '@/contexts/AuthContext';
import {
  ensureDefaultOrganization,
  getOrganizations,
  selectOrganization as persistSelectedOrganization,
} from '@/services/contactsApi';
import type { Organization } from '@/types';
import { OrganizationContext, type OrganizationContextValue } from './organization-context';

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthState();
  const queryClient = useQueryClient();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const userId = currentUser?.uid;

  const refresh = useCallback(async (): Promise<Organization | null> => {
    if (!userId) {
      setOrganizations([]);
      setOrganization(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      let memberships = await getOrganizations();
      if (memberships.length === 0) {
        const created = await ensureDefaultOrganization();
        memberships = [{ ...created, is_default: true }];
      }

      let selected = memberships.find((candidate) => candidate.is_default);
      if (!selected) {
        const repaired = await ensureDefaultOrganization();
        memberships = memberships.map((candidate) => ({
          ...candidate,
          is_default: candidate.id === repaired.id,
        }));
        selected = memberships.find((candidate) => candidate.id === repaired.id) ?? repaired;
      }
      setOrganizations(memberships);
      setOrganization(selected);
      setError(null);
      return selected;
    } catch (refreshError) {
      setOrganizations([]);
      setOrganization(null);
      setError(refreshError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectOrganization = useCallback(async (organizationId: number): Promise<Organization> => {
    const membership = organizations.find((candidate) => candidate.id === organizationId);
    if (!membership) {
      throw new Error('Organization is not available to the current user');
    }
    if (organization?.id === organizationId) return organization;

    setIsSwitching(true);
    try {
      const selected = await persistSelectedOrganization(organizationId);
      const normalized = { ...membership, ...selected, is_default: true };

      queryClient.clear();
      setOrganizations((current) => current.map((candidate) => ({
        ...candidate,
        is_default: candidate.id === organizationId,
      })));
      setOrganization(normalized);
      setError(null);
      return normalized;
    } finally {
      setIsSwitching(false);
    }
  }, [organization, organizations, queryClient]);

  const value = useMemo<OrganizationContextValue>(() => ({
    organizations,
    organization,
    organizationId: organization?.id ?? null,
    isLoading,
    isSwitching,
    error,
    refresh,
    selectOrganization,
  }), [error, isLoading, isSwitching, organization, organizations, refresh, selectOrganization]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
