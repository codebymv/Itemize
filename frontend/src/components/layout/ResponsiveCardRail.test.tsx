import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveCardRail } from './ResponsiveCardRail';

let isMobile = true;

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile,
}));

describe('ResponsiveCardRail', () => {
  beforeEach(() => {
    isMobile = true;
  });

  it('groups cards in a labelled mobile scroll region', () => {
    render(
      <ResponsiveCardRail
        label="Estimate status summary"
        desktopColumns="md:grid-cols-4"
      >
        <div>Declined</div>
        <div>Draft</div>
      </ResponsiveCardRail>,
    );

    const rail = screen.getByRole('region', { name: 'Estimate status summary' });
    expect(rail).toHaveAttribute('tabindex', '0');
    expect(rail).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    expect(rail.children).toHaveLength(2);
    expect(rail.firstElementChild).toHaveClass('flex-[0_0_82%]');
    expect(screen.queryByLabelText('Estimate status summary position')).not.toBeInTheDocument();
  });

  it('shows interactive position indicators for four or more cards', () => {
    const scrollTo = vi.fn();
    render(
      <ResponsiveCardRail label="Invoice summary" desktopColumns="md:grid-cols-4">
        <div>Overdue</div>
        <div>Draft</div>
        <div>Due soon</div>
        <div>Paid</div>
      </ResponsiveCardRail>,
    );

    const rail = screen.getByRole('region', { name: 'Invoice summary' });
    const thirdCard = rail.children.item(2) as HTMLElement;
    Object.defineProperty(thirdCard, 'offsetLeft', { value: 480 });
    Object.defineProperty(rail, 'scrollTo', { value: scrollTo });
    fireEvent.click(screen.getByRole('button', { name: 'Show card 3 of 4' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: 480, behavior: 'smooth' });
    expect(screen.getByRole('button', { name: 'Show card 3 of 4' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('supports wider mobile cards for dense content', () => {
    render(
      <ResponsiveCardRail
        label="Performance analytics"
        desktopColumns="md:grid-cols-2"
        mobileCardClassName="flex-[0_0_92%]"
      >
        <div>Conversion Rates</div>
      </ResponsiveCardRail>,
    );

    const rail = screen.getByRole('region', { name: 'Performance analytics' });
    expect(rail.firstElementChild).toHaveClass('flex-[0_0_92%]');
  });

  it('keeps the desktop grid out of the keyboard tab order', () => {
    isMobile = false;
    render(
      <ResponsiveCardRail label="Activity overview" desktopColumns="md:grid-cols-3">
        <div>Overdue</div>
      </ResponsiveCardRail>,
    );

    expect(screen.getByRole('region', { name: 'Activity overview' })).not.toHaveAttribute(
      'tabindex',
    );
  });
});
