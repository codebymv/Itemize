import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getWorkspaceDestinations, getWorkspaceLanding } from '@/lib/workspaceNavigation';

const subscriptionState = vi.hoisted(() => ({
  isLoading: false,
  isSubscribed: true,
  isTrialing: true,
  tierLevel: 1,
}));

const getStartedProgressViaGraphql = vi.hoisted(() => vi.fn());

vi.mock('@/components/AppShell', () => ({
  useSearch: () => ({ setSearchOpen: vi.fn() }),
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionState: () => subscriptionState,
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId: 42 }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/services/getStartedGraphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/getStartedGraphql')>();
  return {
    ...actual,
    getStartedProgressViaGraphql,
  };
});

const renderSidebar = (initialPath = '/dashboard') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AppSidebar first-run disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionState.isLoading = false;
    subscriptionState.isSubscribed = true;
    subscriptionState.isTrialing = true;
    subscriptionState.tierLevel = 1;
  });

  it('keeps the trial golden path visible and places expansion modules under More tools', async () => {
    getStartedProgressViaGraphql.mockResolvedValue({
      dismissed: false,
      completedCount: 1,
      totalCount: 3,
      steps: [
        { id: 'first_contact', completed: true, completedAt: '2026-08-24T00:00:00Z', href: '/contacts' },
        { id: 'first_artifact', completed: false, completedAt: null, href: '/estimates/new' },
        { id: 'first_send', completed: false, completedAt: null, href: '/estimates' },
      ],
    });

    renderSidebar();

    expect(await screen.findByRole('button', { name: 'More tools' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Sales & Payments')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.queryByText('Automations')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));

    expect(await screen.findByText('Automations')).toBeInTheDocument();
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Scheduling')).toBeInTheDocument();
  });

  it('restores the full navigation after the first provider-confirmed send', async () => {
    getStartedProgressViaGraphql.mockResolvedValue({
      dismissed: false,
      completedCount: 3,
      totalCount: 3,
      steps: [
        { id: 'first_contact', completed: true, completedAt: '2026-08-24T00:00:00Z', href: '/contacts' },
        { id: 'first_artifact', completed: true, completedAt: '2026-08-24T00:01:00Z', href: '/estimates/1' },
        { id: 'first_send', completed: true, completedAt: '2026-08-24T00:02:00Z', href: '/estimates' },
      ],
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('Automations')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'More tools' })).not.toBeInTheDocument();
  });

  it('does not offer the desktop-only Canvas route in mobile navigation', () => {
    expect(getWorkspaceLanding(true).path).toBe('/contents');
    expect(getWorkspaceDestinations(true).map((item) => item.title)).toEqual([
      'Contents',
      'Shared',
    ]);
    expect(getWorkspaceDestinations(false).map((item) => item.title)).toEqual([
      'Canvas',
      'Contents',
      'Shared',
    ]);
  });
});
