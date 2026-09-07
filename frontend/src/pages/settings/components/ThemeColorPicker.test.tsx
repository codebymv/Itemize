import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemeColor } from '@/lib/themeColor';

const updateViewerPreferencesViaGraphql = vi.fn();
const updateCurrentUser = vi.fn();
const toast = vi.fn();

vi.mock('@/services/authGraphql', () => ({
  updateViewerPreferencesViaGraphql: (...args: unknown[]) => updateViewerPreferencesViaGraphql(...args),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: { uid: '1', name: 'Dev', email: 'dev@itemize.local', themeColor: 'blue' } }),
  useAuthActions: () => ({ updateCurrentUser }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { ThemeColorPicker } from './ThemeColorPicker';

describe('ThemeColorPicker', () => {
  beforeEach(() => {
    updateViewerPreferencesViaGraphql.mockReset();
    updateCurrentUser.mockReset();
    toast.mockReset();
    applyThemeColor('blue');
  });
  afterEach(() => applyThemeColor('blue'));

  it('offers the three product hues as a radio group with 44px targets', () => {
    render(<ThemeColorPicker />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map(radio => radio.getAttribute('aria-label'))).toEqual(['Blue', 'Purple', 'Pink']);
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
    radios.forEach(radio => expect(radio).toHaveClass('h-11', 'w-11'));
    radios.forEach(radio => expect(radio).not.toHaveTextContent(/\S/));
  });

  it('applies the theme immediately and records it on the account', async () => {
    updateViewerPreferencesViaGraphql.mockResolvedValue({ themeColor: 'purple' });
    render(<ThemeColorPicker />);
    fireEvent.click(screen.getByRole('radio', { name: 'Purple' }));
    expect(document.documentElement.getAttribute('data-theme-color')).toBe('purple');
    await waitFor(() => expect(updateViewerPreferencesViaGraphql).toHaveBeenCalledWith('purple'));
    await waitFor(() => expect(updateCurrentUser).toHaveBeenCalledWith({ themeColor: 'purple' }));
    expect(toast).not.toHaveBeenCalled();
  });

  it('reverts and explains when the save fails', async () => {
    updateViewerPreferencesViaGraphql.mockRejectedValue(new Error('offline'));
    render(<ThemeColorPicker />);
    fireEvent.click(screen.getByRole('radio', { name: 'Pink' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(document.documentElement.hasAttribute('data-theme-color')).toBe(false);
    expect(updateCurrentUser).not.toHaveBeenCalled();
  });
});
