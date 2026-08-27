import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoverAccount from './RecoverAccount';

const recover = vi.fn();
vi.mock('@/services/authGraphql', () => ({
  recoverViewerAccountViaGraphql: (...args: unknown[]) => recover(...args),
}));

describe('RecoverAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recover.mockResolvedValue({ success: true });
  });

  it('requires an explicit click before consuming the recovery capability', async () => {
    render(
      <MemoryRouter initialEntries={['/recover-account?token=secure-token']}>
        <RecoverAccount />
      </MemoryRouter>,
    );
    expect(recover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    await waitFor(() => expect(recover).toHaveBeenCalledWith('secure-token'));
    expect(await screen.findByText('Account recovered')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to Itemize' }))
      .toHaveAttribute('href', '/login');
  });

  it('does not offer recovery without a token', () => {
    render(
      <MemoryRouter initialEntries={['/recover-account']}>
        <RecoverAccount />
      </MemoryRouter>,
    );
    expect(screen.getByText(/recovery link is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep my account' })).not.toBeInTheDocument();
  });
});
