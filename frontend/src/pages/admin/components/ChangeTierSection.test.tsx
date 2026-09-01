import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangeTierSection from './ChangeTierSection';
import * as adminApi from '@/services/adminApi';

const refreshSubscription = vi.fn();
const toast = vi.fn();

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionState: () => ({ subscription: { planName: 'free', status: 'none' } }),
  useSubscriptionFeatures: () => ({ refreshSubscription }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/services/adminApi', () => ({
  updateMyPlan: vi.fn(),
}));

describe('ChangeTierSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.updateMyPlan).mockResolvedValue({
      message: 'Plan updated to starter', plan: 'starter',
    });
  });

  it('shows success only after billing state confirms the selected tier', async () => {
    refreshSubscription.mockResolvedValue({ planName: 'starter', status: 'active' });
    render(<ChangeTierSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Solo' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: 'Plan Updated',
      description: 'Your plan has been changed to Solo',
    }));
    expect(adminApi.updateMyPlan).toHaveBeenCalledWith('starter');
    expect(refreshSubscription).toHaveBeenCalledOnce();
  });

  it('does not show a false success when the authoritative tier remains stale', async () => {
    refreshSubscription.mockResolvedValue({ planName: 'free', status: 'none' });
    render(<ChangeTierSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Solo' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'The plan update was accepted but the entitlement state did not refresh.',
      variant: 'destructive',
    }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Plan Updated' }));
  });

  it('admits only one plan change before pending state renders', async () => {
    let resolveUpdate: (() => void) | undefined;
    vi.mocked(adminApi.updateMyPlan).mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = () => resolve({ message: 'Plan updated to starter', plan: 'starter' });
    }));
    refreshSubscription.mockResolvedValue({ planName: 'starter', status: 'active' });
    render(<ChangeTierSection />);

    const button = screen.getByRole('button', { name: 'Solo' });
    act(() => {
      button.click();
      button.click();
    });

    expect(adminApi.updateMyPlan).toHaveBeenCalledOnce();
    await act(async () => {
      resolveUpdate?.();
    });
    await waitFor(() => expect(refreshSubscription).toHaveBeenCalledOnce());
  });
});
