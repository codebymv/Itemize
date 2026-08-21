import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardStatRail } from './DashboardStatRail';

describe('DashboardStatRail', () => {
  it('groups and wraps stat cards in a labelled manual-scroll region', () => {
    render(
      <DashboardStatRail
        label="CRM overview"
        isMobile
        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
      >
        <div>Total Contacts</div>
        <div>Open Deals</div>
      </DashboardStatRail>,
    );

    const rail = screen.getByRole('region', { name: 'CRM overview' });
    expect(rail).toHaveAttribute('tabindex', '0');
    expect(rail).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    expect(rail.children).toHaveLength(2);
  });

  it('keeps the desktop grid out of the keyboard tab order', () => {
    render(
      <DashboardStatRail
        label="Activity overview"
        isMobile={false}
        desktopColumns="md:grid-cols-3"
      >
        <div>Overdue</div>
      </DashboardStatRail>,
    );

    expect(screen.getByRole('region', { name: 'Activity overview' })).not.toHaveAttribute(
      'tabindex',
    );
  });
});
