import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingCards } from './PricingCards';

describe('PricingCards', () => {
  it('offers an eligible Free workspace a no-card Solo trial', () => {
    const onUpgrade = vi.fn();
    render(
      <PricingCards
        variant="dashboard"
        currentPlan="free"
        starterTrialEligible
        onUpgrade={onUpgrade}
        showYearlyToggle={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start Solo Trial' }));
    expect(onUpgrade).toHaveBeenCalledWith('starter');
    expect(
      screen.getByText('Start Solo free for 14 days. No credit card required.'),
    ).toBeInTheDocument();
  });

  it('describes Stripe checkout when a free trial is unavailable', () => {
    render(
      <PricingCards
        variant="dashboard"
        currentPlan="starter"
        showYearlyToggle={false}
      />,
    );

    expect(
      screen.getByText('Subscriptions are managed securely through Stripe.'),
    ).toBeInTheDocument();
  });

  it('lets a no-card Solo trial subscribe to its current plan', () => {
    const onUpgrade = vi.fn();
    render(
      <PricingCards
        variant="dashboard"
        currentPlan="starter"
        canSubscribeCurrentTrial
        onUpgrade={onUpgrade}
        showYearlyToggle={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe to Solo' }));
    expect(onUpgrade).toHaveBeenCalledWith('starter');
  });
});
