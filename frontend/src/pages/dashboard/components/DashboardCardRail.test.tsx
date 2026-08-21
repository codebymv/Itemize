import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardCardRail } from './DashboardCardRail';

describe('DashboardCardRail', () => {
  it('groups and wraps cards in a labelled manual-scroll region', () => {
    render(
      <DashboardCardRail
        label="CRM overview"
        isMobile
        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
      >
        <div>Total Contacts</div>
        <div>Open Deals</div>
      </DashboardCardRail>,
    );

    const rail = screen.getByRole('region', { name: 'CRM overview' });
    expect(rail).toHaveAttribute('tabindex', '0');
    expect(rail).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    expect(rail.children).toHaveLength(2);
    expect(rail.firstElementChild).toHaveClass('flex-[0_0_82%]');
  });

  it('supports wider mobile module cards', () => {
    render(
      <DashboardCardRail
        label="Module summaries"
        isMobile
        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
        mobileCardClassName="flex-[0_0_88%]"
      >
        <div>Invoices</div>
      </DashboardCardRail>,
    );

    const rail = screen.getByRole('region', { name: 'Module summaries' });
    expect(rail.firstElementChild).toHaveClass('flex-[0_0_88%]');
  });

  it('keeps the desktop grid out of the keyboard tab order', () => {
    render(
      <DashboardCardRail
        label="Activity overview"
        isMobile={false}
        desktopColumns="md:grid-cols-3"
      >
        <div>Overdue</div>
      </DashboardCardRail>,
    );

    expect(screen.getByRole('region', { name: 'Activity overview' })).not.toHaveAttribute(
      'tabindex',
    );
  });
});
