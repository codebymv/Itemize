import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationInvite from './OrganizationInvite';

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; email: string; name: string },
  preview: vi.fn(),
  accept: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: mocks.currentUser, loading: false }),
}));
vi.mock('@/services/organizationsGraphql', () => ({
  getOrganizationInvitationPreviewViaGraphql: (...args: unknown[]) => mocks.preview(...args),
  acceptOrganizationInvitationViaGraphql: (...args: unknown[]) => mocks.accept(...args),
}));

const token = 'a'.repeat(64);
const renderPage = () => render(
  <MemoryRouter initialEntries={[`/invite/${token}`]}>
    <Routes>
      <Route path="/invite/:token" element={<OrganizationInvite />} />
      <Route path="/organization-settings" element={<div>Organization settings</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('OrganizationInvite', () => {
  beforeEach(() => {
    mocks.currentUser = null;
    mocks.preview.mockResolvedValue({
      organization_name: 'Alpha Studio',
      email: 'invitee@example.com',
      role: 'member',
      status: 'pending',
      expires_at: '2026-09-03T12:00:00.000Z',
      invited_by_name: 'Ada',
    });
    mocks.accept.mockResolvedValue({
      organizationId: 4,
      organizationName: 'Alpha Studio',
      role: 'member',
    });
  });

  it('preserves the secure token across account creation and login', async () => {
    renderPage();

    expect(await screen.findByText('Alpha Studio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create account and join' }))
      .toHaveAttribute(
        'href',
        `/register?invitation=${token}&email=invitee%40example.com`,
      );
    expect(screen.getByRole('link', { name: 'Sign in and join' }))
      .toHaveAttribute('href', `/login?redirect=%2Finvite%2F${token}`);
  });

  it('accepts only after an authenticated user confirms', async () => {
    mocks.currentUser = { uid: '12', email: 'invitee@example.com', name: 'Invitee' };
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(token));
    expect(screen.getByText('Invitation accepted')).toBeInTheDocument();
  });
});
