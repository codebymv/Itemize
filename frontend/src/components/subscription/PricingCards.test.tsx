import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingCards } from './PricingCards';

describe('PricingCards', () => {
  it('uses the shared tab primitive for billing periods', () => {
    const onBillingPeriodChange = vi.fn();
    render(
      <PricingCards
        billingPeriod="monthly"
        onBillingPeriodChange={onBillingPeriodChange}
      />,
    );

    const monthly = screen.getByRole('tab', { name: 'Monthly' });
    const yearly = screen.getByRole('tab', { name: /Yearly/ });

    expect(monthly).toHaveAttribute('data-state', 'active');
    expect(yearly).toHaveClass('hover:bg-accent');
    fireEvent.mouseDown(yearly, { button: 0, ctrlKey: false });
    expect(onBillingPeriodChange).toHaveBeenCalledWith('yearly');
  });

  it('offers an eligible Free organization a no-card Solo trial', () => {
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

  it('describes tenant ownership limits as organizations', () => {
    render(<PricingCards hideFree={false} showYearlyToggle={false} />);

    expect(screen.getByText('Own 1 organization')).toBeInTheDocument();
    expect(screen.getByText('Own up to 3 organizations')).toBeInTheDocument();
    expect(screen.getByText('Own unlimited organizations')).toBeInTheDocument();
    expect(screen.queryByText(/Own .*workspaces/i)).not.toBeInTheDocument();
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
