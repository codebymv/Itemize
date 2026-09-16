import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  // Async callers can refresh and then select before React publishes new callbacks.
  const selectionRef = useRef<{ memberships: Organization[]; selected: Organization | null }>({
    memberships: [], selected: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const userId = currentUser?.uid;

  const refresh = useCallback(async (): Promise<Organization | null> => {
    if (!userId) {
      selectionRef.current = { memberships: [], selected: null };
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
      selectionRef.current = { memberships, selected };
      setOrganizations(memberships);
      setOrganization(selected);
      setError(null);
      return selected;
    } catch (refreshError) {
      selectionRef.current = { memberships: [], selected: null };
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
    const { memberships, selected: currentOrganization } = selectionRef.current;
    const membership = memberships.find((candidate) => candidate.id === organizationId);
    if (!membership) {
      throw new Error('Organization is not available to the current user');
    }
    if (currentOrganization?.id === organizationId) return currentOrganization;

    setIsSwitching(true);
    try {
      const selected = await persistSelectedOrganization(organizationId);
      const normalized = { ...membership, ...selected, is_default: true };

      queryClient.clear();
      const updatedMemberships = selectionRef.current.memberships.map((candidate) => ({
        ...candidate,
        is_default: candidate.id === organizationId,
      }));
      selectionRef.current = { memberships: updatedMemberships, selected: normalized };
      setOrganizations(updatedMemberships);
      setOrganization(normalized);
      setError(null);
      return normalized;
    } finally {
      setIsSwitching(false);
    }
  }, [queryClient]);

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
