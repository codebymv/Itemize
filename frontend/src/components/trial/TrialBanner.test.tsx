import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialBanner } from './TrialBanner';

const useTrialStatus = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useTrialStatus', () => ({ useTrialStatus }));

const renderBanner = (onDismiss?: () => void) => render(
  <MemoryRouter>
    <TrialBanner
      trialEndsAt="2026-09-03T00:00:00.000Z"
      trialPlan="Solo"
      onDismiss={onDismiss}
    />
  </MemoryRouter>,
);

describe('TrialBanner dismissal', () => {
  beforeEach(() => {
    useTrialStatus.mockReturnValue({
      daysRemaining: 14,
      isInTrial: true,
      isUrgent: false,
      isActive: false,
    });
  });

  it('can be dismissed without requiring a persistence callback', () => {
    renderBanner();

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss trial reminder' })[0]);

    expect(screen.queryByRole('banner', { name: 'Trial status banner' })).not.toBeInTheDocument();
  });

  it('returns on a fresh mount and still supports dismissal observers', () => {
    const onDismiss = vi.fn();
    const first = renderBanner(onDismiss);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss trial reminder' })[0]);
    expect(onDismiss).toHaveBeenCalledOnce();

    first.unmount();
    renderBanner();

    expect(screen.getByRole('banner', { name: 'Trial status banner' })).toBeInTheDocument();
    expect(screen.getByText(/Your Solo trial ends on/)).toBeInTheDocument();
  });
});
