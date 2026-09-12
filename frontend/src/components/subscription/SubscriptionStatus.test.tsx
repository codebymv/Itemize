import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus } from './SubscriptionStatus';

const { state } = vi.hoisted(() => ({ state: {
  planName: 'starter', isLoading: false,
  subscription: { status: 'active', billingPeriod: 'yearly', cancelAtPeriodEnd: false,
    currentPeriod: { end: '2027-09-12T12:00:00Z' } },
} }));
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscriptionState: () => state }));
vi.mock('@/pages/settings/components/useManageSubscription', () => ({
  useManageSubscription: () => ({ available: false }),
}));

describe('SubscriptionStatus billing terms', () => {
  it('shows the actual annual billing period', () => {
    state.subscription.cancelAtPeriodEnd = false;
    render(<SubscriptionStatus />);
    expect(screen.getByText('$290/year')).toBeInTheDocument();
    expect(screen.queryByText('$29/month')).not.toBeInTheDocument();
    expect(screen.getByText(/Renews on/)).toBeInTheDocument();
  });
  it('does not promise renewal when cancellation is scheduled', () => {
    state.subscription.cancelAtPeriodEnd = true;
    render(<SubscriptionStatus />);
    expect(screen.getByText(/Access ends on/)).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
  });
});
