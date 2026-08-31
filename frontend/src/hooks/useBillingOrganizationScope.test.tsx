import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUsageStats } from '@/services/billingApi';
import { getOrganizationBootstrapViaGraphql } from '@/services/organizationBootstrapGraphql';
import { useBillingStatus } from './useBillingStatus';
import { useUsageStats } from './useUsageStats';

const mocks = vi.hoisted(() => ({ organizationId: 1 as number | null }));

vi.mock('@/contexts/organization-context', () => ({
  useOrganizationContext: () => ({ organizationId: mocks.organizationId }),
}));

vi.mock('@/services/billingApi', () => ({
  getUsageStats: vi.fn(),
}));

vi.mock('@/services/organizationBootstrapGraphql', () => ({
  organizationBootstrapQueryKey: (organizationId: number | null) => ['organization-bootstrap', organizationId],
  getOrganizationBootstrapViaGraphql: vi.fn(),
}));

describe('billing query organization scope', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationId = 1;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getOrganizationBootstrapViaGraphql).mockImplementation(async () => ({
      billingStatus: { plan: mocks.organizationId === 1 ? 'starter' : 'free' } as never,
      onboardingProgress: {},
      getStartedProgress: { dismissed: false, completedCount: 0, totalCount: 0, steps: [] },
    }));
    vi.mocked(getUsageStats).mockImplementation(async () => ({
      success: true,
      data: { resources: { contacts: mocks.organizationId } } as never,
    }));
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches fresh status and usage after the selected organization changes', async () => {
    const { result, rerender } = renderHook(() => ({
      status: useBillingStatus(),
      usage: useUsageStats(),
    }), { wrapper });

    await waitFor(() => expect(result.current.status.data?.plan).toBe('starter'));
    await waitFor(() => expect(result.current.usage.data?.resources.contacts).toBe(1));

    mocks.organizationId = 2;
    rerender();

    await waitFor(() => expect(result.current.status.data?.plan).toBe('free'));
    await waitFor(() => expect(result.current.usage.data?.resources.contacts).toBe(2));
    expect(getOrganizationBootstrapViaGraphql).toHaveBeenCalledTimes(2);
    expect(getUsageStats).toHaveBeenCalledTimes(2);
  });

  it('does not query billing before an organization is available', () => {
    mocks.organizationId = null;
    const { result } = renderHook(() => useBillingStatus(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getOrganizationBootstrapViaGraphql).not.toHaveBeenCalled();
  });
});
