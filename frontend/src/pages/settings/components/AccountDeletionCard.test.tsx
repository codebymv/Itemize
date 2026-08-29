import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionAction } from './AccountDeletionCard';

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  preflight: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  user: {
    uid: '41',
    name: 'Member',
    email: 'member@example.com',
    provider: 'email',
  },
}));

vi.mock('@/services/authGraphql', () => ({
  deleteViewerAccountViaGraphql: (...args: unknown[]) => mocks.deleteAccount(...args),
  getViewerAccountDeletionPreflightViaGraphql: () => mocks.preflight(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: mocks.user }),
  useAuthActions: () => ({ logout: mocks.logout }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

const eligiblePreflight = {
  eligible: true,
  recoveryDays: 7,
  membershipCount: 2,
  ownedOrganizationCount: 1,
  blockers: [],
  retentionNotices: ['Audit records retain a one-way email hash.'],
};

describe('AccountDeletionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.provider = 'email';
    mocks.preflight.mockResolvedValue(eligiblePreflight);
    mocks.deleteAccount.mockResolvedValue({
      success: true,
      scheduledAt: '2026-09-03T12:00:00.000Z',
      recoveryDays: 7,
    });
  });

  it('preflights and requires the account email plus current password', async () => {
    render(<AccountDeletionAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText(/permanently delete 1 owned organization/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Schedule account deletion' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type member@example.com to confirm'), {
      target: { value: 'member@example.com' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'StrongPass1' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledWith(
      'member@example.com',
      'StrongPass1',
    ));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Account deletion scheduled',
    }));
  });

  it('does not request a password for Google-only accounts', async () => {
    mocks.user.provider = 'google';
    render(<AccountDeletionAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await screen.findByLabelText('Type member@example.com to confirm');
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type member@example.com to confirm'), {
      target: { value: 'MEMBER@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule account deletion' }));

    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledWith(
      'MEMBER@example.com',
      undefined,
    ));
  });

  it('shows every organization blocker before requesting deletion credentials', async () => {
    mocks.preflight.mockResolvedValue({
      ...eligiblePreflight,
      eligible: false,
      blockers: [
        {
          reason: 'OWNERSHIP_TRANSFER_REQUIRED',
          organizationId: 8,
          organizationName: 'Client Organization',
        },
        {
          reason: 'ACTIVE_SUBSCRIPTION',
          organizationId: 9,
          organizationName: 'Paid Organization',
        },
      ],
    });
    render(<AccountDeletionAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Resolve these items first')).toBeInTheDocument();
    expect(screen.getByText('Transfer ownership of Client Organization to another member.'))
      .toBeInTheDocument();
    expect(screen.getByText('Cancel the active subscription for Paid Organization.'))
      .toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review organization settings' })).toBeEnabled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });
});
