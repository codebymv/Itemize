import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminMfaGate } from './AdminMfaGate';
import * as api from '@/services/adminMfaGraphql';
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: { provider: 'email' } }),
}));
vi.mock('@/services/adminMfaGraphql', () => ({
  adminMfaStatus: vi.fn(),
  beginAdminMfaSetup: vi.fn(),
  confirmAdminMfaSetup: vi.fn(),
  lockAdminMfa: vi.fn(),
  reauthenticateAdmin: vi.fn(),
  recoverAdminMfa: vi.fn(),
  verifyAdminMfa: vi.fn(),
}));
const status = {
  enrolled: true,
  verified: false,
  recovery: false,
  reauthenticated: false,
  sessionRequired: false,
  expiresAt: null,
};
describe('Admin MFA access gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.adminMfaStatus).mockResolvedValue(status);
  });
  it('does not mount admin content while checking or when locked', async () => {
    render(
      <AdminMfaGate>
        <div>Protected operations</div>
      </AdminMfaGate>,
    );
    expect(screen.queryByText('Protected operations')).not.toBeInTheDocument();
    await screen.findByLabelText('Authenticator code');
    expect(screen.queryByText('Protected operations')).not.toBeInTheDocument();
  });
  it('fails closed when the status request fails', async () => {
    vi.mocked(api.adminMfaStatus).mockRejectedValue(new Error('offline'));
    render(
      <AdminMfaGate>
        <div>Protected operations</div>
      </AdminMfaGate>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not verify',
    );
    expect(screen.queryByText('Protected operations')).not.toBeInTheDocument();
  });
  it('requires reauthentication before exposing enrollment', async () => {
    vi.mocked(api.adminMfaStatus).mockResolvedValue({
      ...status,
      enrolled: false,
    });
    render(
      <AdminMfaGate>
        <div>Protected operations</div>
      </AdminMfaGate>,
    );
    await screen.findByLabelText('Current password');
    expect(api.beginAdminMfaSetup).not.toHaveBeenCalled();
    expect(
      screen.queryByAltText('Authenticator setup QR code'),
    ).not.toBeInTheDocument();
  });
  it('unlocks only after verified server status and locks again explicitly', async () => {
    render(
      <AdminMfaGate>
        <div>Protected operations</div>
      </AdminMfaGate>,
    );
    fireEvent.change(await screen.findByLabelText('Authenticator code'), {
      target: { value: '123456' },
    });
    vi.mocked(api.adminMfaStatus).mockResolvedValue({
      ...status,
      verified: true,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock admin access' }),
    );
    await screen.findByText('Protected operations');
    expect(api.verifyAdminMfa).toHaveBeenCalledWith('123456');
    vi.mocked(api.adminMfaStatus).mockResolvedValue(status);
    fireEvent.click(screen.getByRole('button', { name: 'Lock admin access' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Protected operations'),
      ).not.toBeInTheDocument(),
    );
  });
  it('requires primary confirmation before using recovery', async () => {
    render(
      <AdminMfaGate>
        <div>Protected operations</div>
      </AdminMfaGate>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use a recovery code' }),
    );
    await screen.findByLabelText('Current password');
    expect(api.recoverAdminMfa).not.toHaveBeenCalled();
  });
});
