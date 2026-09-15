import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom';
import {beforeEach, expect, it, vi} from 'vitest';
import Login from './Login';
import ProtectedRoute from '@/components/ProtectedRoute';
const mocks = vi.hoisted(() => ({login: vi.fn(), google: vi.fn()}));
vi.mock('@/contexts/AuthContext', () => ({useAuthState: () => ({currentUser: null, loading: false}), useAuthActions: () => ({loginWithEmail: mocks.login}), AuthError: class extends Error {}}));
vi.mock('@/hooks/useGoogleSignIn', () => ({useGoogleSignIn: () => mocks.google}));
vi.mock('@/components/auth/GoogleOAuthGate', () => ({GoogleOAuthGate: ({children}: {children: React.ReactNode}) => children}));
vi.mock('@/components/ui/BackgroundClouds', () => ({default: () => null}));
const Location = () => {const location = useLocation(); return <output>{location.pathname + location.search + location.hash}</output>;};
beforeEach(() => {vi.clearAllMocks(); mocks.login.mockResolvedValue(undefined);});
const target = '/contacts?view=follow-ups&taskId=42&organizationId=21#client-tasks';
it('sends a signed-out deep link to login with the complete destination', async () => {
  render(<MemoryRouter initialEntries={[target]}><Routes><Route path="/contacts" element={<ProtectedRoute />} /><Route path="/login" element={<Location />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(`/login?${new URLSearchParams({redirect: target})}`));
});
it('email login returns to the exact task and Google receives the same destination', async () => {
  render(<MemoryRouter initialEntries={[`/login?${new URLSearchParams({redirect: target})}`]}><Routes><Route path="/login" element={<Login />} /><Route path="/contacts" element={<Location />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', {name: /Continue with Google/}));
  expect(mocks.google).toHaveBeenCalledWith(target);
  fireEvent.change(screen.getByLabelText('Email'), {target: {value: 'pilot@example.invalid'}});
  fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'synthetic-password'}});
  fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(target));
});
