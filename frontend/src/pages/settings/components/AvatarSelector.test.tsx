import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarSelector } from './AvatarSelector';
const mocks = vi.hoisted(() => ({ update: vi.fn(), save: vi.fn(), catalog: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthState: () => ({ currentUser: { uid: '41', name: 'Bob Jones', avatarKey: null } }), useAuthActions: () => ({ updateCurrentUser: mocks.update }) }));
vi.mock('@/services/authGraphql', () => ({ getAvatarCatalogViaGraphql: mocks.catalog, updateViewerAvatarViaGraphql: mocks.save }));
const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AvatarSelector /></QueryClientProvider>);
describe('AvatarSelector', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.catalog.mockResolvedValue([{ key: 'dawn', name: 'Dawn' }]); });
  it('waits for confirmation and prevents duplicate writes', async () => {
    let finish!: (value: {avatarKey:string}) => void;
    mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount();
    const button = await screen.findByRole('button', {name:'Dawn'});
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    finish({avatarKey:'dawn'});
    await screen.findByText('Saved');
    expect(mocks.update).toHaveBeenCalledWith({avatarKey:'dawn',photoURL:'/assets/avatars/dawn.svg'});
  });
  it('retains the selection on a failed save and supports retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({avatarKey:'dawn'});
    mount();
    fireEvent.click(await screen.findByRole('button',{name:'Dawn'}));
    await screen.findByText('Avatar not saved. Check your connection and try again.');
    expect(screen.getByRole('button',{name:'Initials'})).toHaveAttribute('aria-pressed','true');
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Dawn'}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
  });
});
