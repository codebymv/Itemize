import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openBillingPortal = vi.fn();
const toast = vi.fn();
let subscription: { status: string } | null = { status: 'active' };
let planName = 'Solo';

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionState: () => ({ subscription, planName }),
  useSubscriptionFeatures: () => ({ openBillingPortal }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { ManageSubscriptionAction } from './ManageSubscriptionCard';
import { useManageSubscription } from './useManageSubscription';
import { renderHook } from '@testing-library/react';

describe('ManageSubscriptionAction', () => {
  beforeEach(() => {
    openBillingPortal.mockReset();
    toast.mockReset();
    subscription = { status: 'active' };
    planName = 'Solo';
  });

  it('is available only for a live paid plan', () => {
    expect(renderHook(() => useManageSubscription()).result.current.available).toBe(true);
    subscription = { status: 'trialing' };
    expect(renderHook(() => useManageSubscription()).result.current.available).toBe(false);
    subscription = { status: 'active' };
    planName = 'Free';
    expect(renderHook(() => useManageSubscription()).result.current.available).toBe(false);
  });

  it('opens the billing portal from a labelled cell and reports failure', async () => {
    openBillingPortal.mockRejectedValueOnce(new Error('portal down'));
    render(<ManageSubscriptionAction />);
    expect(screen.getByRole('region', { name: 'Subscription' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Manage subscription' });
    expect(button).toHaveClass('bg-primary', 'interaction-button--primary');
    fireEvent.click(button);
    await waitFor(() => expect(openBillingPortal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'portal down', variant: 'destructive' })));
    expect(button).not.toBeDisabled();
  });
});
