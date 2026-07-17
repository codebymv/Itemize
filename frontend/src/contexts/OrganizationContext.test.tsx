import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthState } from '@/contexts/AuthContext';
import {
  ensureDefaultOrganization,
  getOrganizations,
  selectOrganization as persistSelectedOrganization,
} from '@/services/contactsApi';
import type { Organization } from '@/types';
import { OrganizationProvider } from './OrganizationContext';
import { useOrganizationContext } from './organization-context';

vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: vi.fn(),
}));

vi.mock('@/services/contactsApi', () => ({
  ensureDefaultOrganization: vi.fn(),
  getOrganizations: vi.fn(),
  selectOrganization: vi.fn(),
}));

const organization = (id: number, name: string, isDefault = false): Organization => ({
  id,
  name,
  slug: name.toLowerCase().replace(/ /g, '-'),
  settings: {},
  role: 'owner',
  is_default: isDefault,
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
});

describe('OrganizationProvider', () => {
  let queryClient: QueryClient;
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthState).mockReturnValue({
      currentUser: { uid: '7', name: 'Ada', email: 'ada@example.com' },
      loading: false,
      token: null,
      isAuthenticated: true,
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clearSpy = vi.spyOn(queryClient, 'clear');
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <OrganizationProvider>{children}</OrganizationProvider>
    </QueryClientProvider>
  );

  it('loads the server-selected membership without creating another workspace', async () => {
    vi.mocked(getOrganizations).mockResolvedValue([
      organization(1, 'Alpha'),
      organization(2, 'Beta', true),
    ]);

    const { result } = renderHook(() => useOrganizationContext(), { wrapper });

    await waitFor(() => expect(result.current.organizationId).toBe(2));
    expect(ensureDefaultOrganization).not.toHaveBeenCalled();
  });

  it('persists a selection and clears tenant-scoped query caches', async () => {
    vi.mocked(getOrganizations).mockResolvedValue([
      organization(1, 'Alpha', true),
      organization(2, 'Beta'),
    ]);
    vi.mocked(persistSelectedOrganization).mockResolvedValue(organization(2, 'Beta', true));

    const { result } = renderHook(() => useOrganizationContext(), { wrapper });
    await waitFor(() => expect(result.current.organizationId).toBe(1));

    await act(async () => {
      await result.current.selectOrganization(2);
    });

    expect(persistSelectedOrganization).toHaveBeenCalledWith(2);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(result.current.organizationId).toBe(2);
    expect(result.current.organizations.find((candidate) => candidate.id === 2)?.is_default).toBe(true);
    expect(result.current.organizations.find((candidate) => candidate.id === 1)?.is_default).toBe(false);
  });

  it('creates a personal workspace only when the membership list is empty', async () => {
    vi.mocked(getOrganizations).mockResolvedValue([]);
    vi.mocked(ensureDefaultOrganization).mockResolvedValue(organization(3, 'Personal'));

    const { result } = renderHook(() => useOrganizationContext(), { wrapper });

    await waitFor(() => expect(result.current.organizationId).toBe(3));
    expect(result.current.organizations).toEqual([
      expect.objectContaining({ id: 3, is_default: true }),
    ]);
  });

  it('repairs a stale server default using an existing membership', async () => {
    vi.mocked(getOrganizations).mockResolvedValue([
      organization(1, 'Alpha'),
      organization(2, 'Beta'),
    ]);
    vi.mocked(ensureDefaultOrganization).mockResolvedValue(organization(1, 'Alpha'));

    const { result } = renderHook(() => useOrganizationContext(), { wrapper });

    await waitFor(() => expect(result.current.organizationId).toBe(1));
    expect(ensureDefaultOrganization).toHaveBeenCalledTimes(1);
    expect(result.current.organizations[0].is_default).toBe(true);
  });
});
