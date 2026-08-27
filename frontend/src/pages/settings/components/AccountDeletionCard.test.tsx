import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionCard } from './AccountDeletionCard';

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
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

describe('AccountDeletionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.provider = 'email';
    mocks.deleteAccount.mockResolvedValue({ success: true });
  });

  it('requires the account email and current password before deletion', async () => {
    render(<AccountDeletionCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    const submit = screen.getByRole('button', { name: 'Permanently delete account' });
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
  });

  it('does not request a password for Google-only accounts', async () => {
    mocks.user.provider = 'google';
    render(<AccountDeletionCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type member@example.com to confirm'), {
      target: { value: 'MEMBER@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));

    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledWith(
      'MEMBER@example.com',
      undefined,
    ));
  });

  it('keeps the dialog available and reports a backend blocker', async () => {
    mocks.deleteAccount.mockRejectedValue(new Error('Transfer ownership first.'));
    render(<AccountDeletionCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.change(screen.getByLabelText('Type member@example.com to confirm'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Could not delete account',
      description: 'Transfer ownership first.',
      variant: 'destructive',
    }));
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Permanently delete account' })).toBeEnabled();
  });
});
