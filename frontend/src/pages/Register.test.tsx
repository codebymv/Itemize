import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Register from './Register';

const googleSignIn = vi.fn();

vi.mock('@/components/auth/GoogleOAuthGate', () => ({
  GoogleOAuthGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/useGoogleSignIn', () => ({
  useGoogleSignIn: () => googleSignIn,
}));

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return {
    ...original,
    useAuthActions: () => ({ register: vi.fn() }),
  };
});

describe('Google registration consent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires terms acceptance before starting Free Google signup', () => {
    render(<MemoryRouter initialEntries={['/register']}><Register /></MemoryRouter>);

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I agree to the Terms of Service and Privacy Policy',
    }));
    expect(googleButton).toBeEnabled();

    fireEvent.click(googleButton);
    expect(googleSignIn).toHaveBeenCalledWith('/', 'FREE');
  });

  it('preserves the Solo trial signup mode for Google', () => {
    render(
      <MemoryRouter initialEntries={['/register?mode=trial']}>
        <Register />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I agree to the Terms of Service and Privacy Policy',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(googleSignIn).toHaveBeenCalledWith('/', 'TRIAL');
  });
});
