import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OrganizationSettings } from './OrganizationSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  selectOrganization: vi.fn(),
  organization: {
    id: 7,
    name: 'Ada Studio',
    slug: 'ada-studio',
    settings: {
      timezone: 'America/Phoenix',
      locale: 'en-US',
      defaultBusinessId: 12,
    },
    role: 'owner' as const,
    is_default: true,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
  },
  getMembers: vi.fn(),
  getInvitations: vi.fn(),
  getActivity: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessPage: vi.fn(),
  invite: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  transferOwnership: vi.fn(),
  removeMember: vi.fn(),
  refreshSubscription: vi.fn(),
  createOrganization: vi.fn(),
  getAllowance: vi.fn(),
  subscription: { limits: { users: 3 } },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: { uid: '4', name: 'Ada', email: 'ada@example.com' } }),
}));
vi.mock('@/contexts/organization-context', () => ({
  useOrganizationContext: () => ({
    organization: mocks.organization,
    organizationId: mocks.organization.id,
    organizations: [mocks.organization],
    refresh: mocks.refresh,
    selectOrganization: mocks.selectOrganization,
  }),
}));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionState: () => ({ subscription: mocks.subscription }),
  useSubscriptionFeatures: () => ({ refreshSubscription: mocks.refreshSubscription }),
}));
vi.mock('@/services/contactsApi', () => ({
  createOrganization: (...args: unknown[]) => mocks.createOrganization(...args),
  deleteOrganization: vi.fn(),
  getOrganizationMembers: (...args: unknown[]) => mocks.getMembers(...args),
  getOrganizationInvitations: (...args: unknown[]) => mocks.getInvitations(...args),
  getOrganizationActivity: (...args: unknown[]) => mocks.getActivity(...args),
  getViewerOrganizationAllowance: (...args: unknown[]) => mocks.getAllowance(...args),
  inviteMember: (...args: unknown[]) => mocks.invite(...args),
  leaveOrganization: vi.fn(),
  removeMember: (...args: unknown[]) => mocks.removeMember(...args),
  resendOrganizationInvitation: (...args: unknown[]) => mocks.resendInvitation(...args),
  revokeOrganizationInvitation: (...args: unknown[]) => mocks.revokeInvitation(...args),
  transferOrganizationOwnership: (...args: unknown[]) => mocks.transferOwnership(...args),
  updateMemberRole: vi.fn(),
  updateOrganization: vi.fn(),
}));
vi.mock('@/services/invoicesApi', () => ({
  getBusiness: (...args: unknown[]) => mocks.getBusiness(...args),
  getBusinessPage: (...args: unknown[]) => mocks.getBusinessPage(...args),
}));

describe('OrganizationSettings', () => {
  beforeEach(() => {
    mocks.subscription.limits.users = 3;
    mocks.refresh.mockResolvedValue(undefined);
    mocks.selectOrganization.mockResolvedValue(mocks.organization);
    mocks.getAllowance.mockResolvedValue({
      ownedCount: 1,
      limit: 3,
      canCreate: true,
      sourcePlan: 'starter',
    });
    mocks.createOrganization.mockResolvedValue({
      ...mocks.organization,
      id: 8,
      name: 'Second Studio',
      slug: 'second-studio',
    });
    mocks.transferOwnership.mockResolvedValue(undefined);
    mocks.removeMember.mockResolvedValue(undefined);
    mocks.refreshSubscription.mockResolvedValue(undefined);
    mocks.invite.mockResolvedValue({
      id: 31,
      email: 'invitee@example.com',
      delivery_sent: true,
    });
    mocks.resendInvitation.mockResolvedValue({
      id: 31,
      email: 'invitee@example.com',
      delivery_sent: true,
    });
    mocks.revokeInvitation.mockResolvedValue(undefined);
    mocks.getMembers.mockResolvedValue([
      {
        id: 21,
        organization_id: 7,
        user_id: 4,
        role: 'owner',
        invited_at: '2026-08-24T00:00:00.000Z',
        joined_at: '2026-08-24T00:00:00.000Z',
        user_name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    ]);
    mocks.getInvitations.mockResolvedValue([]);
    mocks.getActivity.mockResolvedValue([]);
    mocks.getBusinessPage.mockResolvedValue({
      businesses: [{
        id: 12,
        organization_id: 7,
        name: 'Ada Consulting',
        is_active: true,
        created_at: '2026-08-24T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
      }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    mocks.getBusiness.mockResolvedValue({
      id: 12,
      organization_id: 7,
      name: 'Ada Consulting',
      is_active: true,
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
    });
  });

  it('presents organization identity, regional defaults, business identity, and members', async () => {
    render(<OrganizationSettings />);

    expect(screen.getByDisplayValue('Ada Studio')).toBeInTheDocument();
    expect(screen.getByText('Organization details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Time zone')).toHaveTextContent('America/Phoenix');
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByLabelText('Default business identity')).toHaveTextContent('Ada Consulting');
    expect(screen.getByText('1 of 3 seats')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete organization/i })).toBeInTheDocument();
    expect(await screen.findByText('1 of 3 owned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How organization ownership limits work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About the default business identity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About organization seats and invitations' })).toBeInTheDocument();
    expect(screen.getByText('Manage organization')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organization deletion requirements' })).toBeInTheDocument();
    expect(screen.queryByText(/highest live plan across organizations you own/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used automatically for new estimates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending invitations use a plan seat/i)).not.toBeInTheDocument();
  });

  it('publishes organization saving into the settings shell', async () => {
    function ShellHarness() {
      const [action, setAction] = useState<ReactNode>(null);
      return (
        <TooltipProvider>
          <div data-testid="shell-action">{action}</div>
          <OrganizationSettings setSaveButton={setAction} />
        </TooltipProvider>
      );
    }

    render(<ShellHarness />);

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByTestId('shell-action')).toContainElement(
      screen.getByRole('button', { name: 'Save changes' }),
    );
    expect(screen.getAllByRole('button', { name: 'Save changes' })).toHaveLength(1);
  });

  it('creates a free organization and selects it', async () => {
    render(<OrganizationSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'New organization' }));
    fireEvent.change(screen.getByLabelText('New organization name'), {
      target: { value: 'Second Studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => {
      expect(mocks.createOrganization).toHaveBeenCalledWith({ name: 'Second Studio' });
      expect(mocks.selectOrganization).toHaveBeenCalledWith(8);
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows the upgrade path at the organization ownership limit', async () => {
    mocks.getAllowance.mockResolvedValueOnce({
      ownedCount: 1,
      limit: 1,
      canCreate: false,
      sourcePlan: 'free',
    });
    render(<OrganizationSettings />);

    expect(await screen.findByText('1 of 1 owned')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade or transfer ownership.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review plans' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings?section=plans');
  });

  it('prevents another invitation when the plan seat limit is reached', async () => {
    mocks.subscription.limits.users = 1;
    render(<OrganizationSettings />);

    await waitFor(() => expect(screen.getByText('1 of 1 seats')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Member email'), {
      target: { value: 'grace@example.com' },
    });
    expect(screen.getByRole('button', { name: 'Plan limit reached' })).toBeDisabled();
  });

  it('requires confirmation before transferring ownership to a joined member', async () => {
    mocks.getMembers.mockResolvedValue([
      {
        id: 21,
        organization_id: 7,
        user_id: 4,
        role: 'owner',
        invited_at: '2026-08-24T00:00:00.000Z',
        joined_at: '2026-08-24T00:00:00.000Z',
        user_name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
      {
        id: 22,
        organization_id: 7,
        user_id: 5,
        role: 'member',
        invited_at: '2026-08-25T00:00:00.000Z',
        joined_at: '2026-08-25T00:05:00.000Z',
        user_name: 'Grace Hopper',
        email: 'grace@example.com',
      },
    ]);
    render(<OrganizationSettings />);

    const trigger = await screen.findByRole('button', {
      name: 'Transfer ownership to grace@example.com',
    });
    fireEvent.click(trigger);
    expect(screen.getByText(/you will remain a member with the admin role/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    await waitFor(() => {
      expect(mocks.transferOwnership).toHaveBeenCalledWith(7, 22);
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.refreshSubscription).toHaveBeenCalled();
    });
  });

  it('requires confirmation before removing a member', async () => {
    mocks.getMembers.mockResolvedValue([
      {
        id: 21,
        organization_id: 7,
        user_id: 4,
        role: 'owner',
        invited_at: '2026-08-24T00:00:00.000Z',
        joined_at: '2026-08-24T00:00:00.000Z',
        user_name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
      {
        id: 22,
        organization_id: 7,
        user_id: 5,
        role: 'member',
        invited_at: '2026-08-25T00:00:00.000Z',
        joined_at: '2026-08-25T00:05:00.000Z',
        user_name: 'Grace Hopper',
        email: 'grace@example.com',
      },
    ]);
    render(<OrganizationSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove grace@example.com' }));
    expect(mocks.removeMember).not.toHaveBeenCalled();
    expect(screen.getByText(/immediately lose access/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));

    await waitFor(() => expect(mocks.removeMember).toHaveBeenCalledWith(7, 22));
  });

  it('shows the durable ownership transfer activity to managers', async () => {
    mocks.getActivity.mockResolvedValueOnce([
      {
        id: '42',
        organizationId: 7,
        eventType: 'organization.ownership_transferred',
        actorUserId: 4,
        actorName: 'Ada Lovelace',
        actorEmail: 'ada@example.com',
        targetUserId: 5,
        targetName: 'Grace Hopper',
        targetEmail: 'grace@example.com',
        payload: {},
        occurredAt: '2026-08-27T12:00:00.000Z',
      },
    ]);
    render(<OrganizationSettings />);

    expect(await screen.findByText(
      'Ada Lovelace transferred organization ownership to Grace Hopper.',
    )).toBeInTheDocument();
    expect(mocks.getActivity).toHaveBeenCalledWith(7, 20);
  });

  it('defers older organization activity until requested', async () => {
    mocks.getActivity.mockResolvedValueOnce(
      Array.from({ length: 4 }, (_, index) => ({
        id: String(index + 1),
        organizationId: 7,
        eventType: 'organization.updated',
        actorUserId: index + 1,
        actorName: `Member ${index + 1}`,
        actorEmail: `member${index + 1}@example.com`,
        targetUserId: null,
        targetName: null,
        targetEmail: null,
        payload: {},
        occurredAt: `2026-08-2${index + 1}T12:00:00.000Z`,
      })),
    );
    render(<OrganizationSettings />);

    const disclosure = await screen.findByRole('button', { name: 'View all activity (4)' });
    expect(screen.getByText('Member 3 updated the organization.')).toBeInTheDocument();
    expect(screen.queryByText('Member 4 updated the organization.')).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(screen.getByText('Member 4 updated the organization.')).toBeInTheDocument();
  });

  it('shows pending seat reservations and supports resend and revoke', async () => {
    mocks.subscription.limits.users = 2;
    mocks.getInvitations.mockResolvedValue([
      {
        id: 31,
        organization_id: 7,
        organization_name: 'Ada Studio',
        email: 'invitee@example.com',
        role: 'member',
        status: 'pending',
        invited_at: '2026-08-27T12:00:00.000Z',
        expires_at: '2026-09-03T12:00:00.000Z',
        delivery_sent: true,
      },
    ]);
    render(<OrganizationSettings />);

    await waitFor(() => expect(screen.getByText('2 of 2 seats')).toBeInTheDocument());
    expect(screen.getByText('Pending invitations')).toBeInTheDocument();
    expect(screen.getByText('invitee@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan limit reached' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Resend invitation to invitee@example.com' }));
    await waitFor(() => expect(mocks.resendInvitation).toHaveBeenCalledWith(7, 31));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation to invitee@example.com' }));
    await waitFor(() => expect(mocks.revokeInvitation).toHaveBeenCalledWith(7, 31));
  });
});
