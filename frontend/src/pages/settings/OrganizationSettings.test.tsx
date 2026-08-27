import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  getBusinesses: vi.fn(),
  invite: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  transferOwnership: vi.fn(),
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
}));
vi.mock('@/services/contactsApi', () => ({
  createOrganization: (...args: unknown[]) => mocks.createOrganization(...args),
  deleteOrganization: vi.fn(),
  getOrganizationMembers: (...args: unknown[]) => mocks.getMembers(...args),
  getOrganizationInvitations: (...args: unknown[]) => mocks.getInvitations(...args),
  getViewerOrganizationAllowance: (...args: unknown[]) => mocks.getAllowance(...args),
  inviteMember: (...args: unknown[]) => mocks.invite(...args),
  leaveOrganization: vi.fn(),
  removeMember: vi.fn(),
  resendOrganizationInvitation: (...args: unknown[]) => mocks.resendInvitation(...args),
  revokeOrganizationInvitation: (...args: unknown[]) => mocks.revokeInvitation(...args),
  transferOrganizationOwnership: (...args: unknown[]) => mocks.transferOwnership(...args),
  updateMemberRole: vi.fn(),
  updateOrganization: vi.fn(),
}));
vi.mock('@/services/invoicesApi', () => ({
  getBusinesses: (...args: unknown[]) => mocks.getBusinesses(...args),
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
    mocks.getBusinesses.mockResolvedValue([
      {
        id: 12,
        organization_id: 7,
        name: 'Ada Consulting',
        is_active: true,
        created_at: '2026-08-24T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
      },
    ]);
  });

  it('presents workspace identity, regional defaults, business identity, and members', async () => {
    render(<OrganizationSettings />);

    expect(screen.getByDisplayValue('Ada Studio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Time zone')).toHaveTextContent('America/Phoenix');
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByLabelText('Default business identity')).toHaveTextContent('Ada Consulting');
    expect(screen.getByText('1 of 3 seats')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete organization/i })).toBeInTheDocument();
    expect(await screen.findByText('1 of 3 owned')).toBeInTheDocument();
    expect(screen.getByText(/plans and billing belong to each workspace/i)).toBeInTheDocument();
  });

  it('creates a free workspace and selects it', async () => {
    render(<OrganizationSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'New workspace' }));
    fireEvent.change(screen.getByLabelText('New workspace name'), {
      target: { value: 'Second Studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(mocks.createOrganization).toHaveBeenCalledWith({ name: 'Second Studio' });
      expect(mocks.selectOrganization).toHaveBeenCalledWith(8);
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows the upgrade path at the workspace ownership limit', async () => {
    mocks.getAllowance.mockResolvedValueOnce({
      ownedCount: 1,
      limit: 1,
      canCreate: false,
      sourcePlan: 'free',
    });
    render(<OrganizationSettings />);

    expect(await screen.findByText('1 of 1 owned')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New workspace' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review plans' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings');
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
    });
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
