import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Circle } from 'lucide-react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders as an accessible inset information tile by default', () => {
    const { container } = render(
      <StatCard
        title="Contacts"
        badgeText="Total Contacts"
        value={3}
        icon={Circle}
        description="3 added this month"
      />,
    );

    expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Contacts' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-card-surface', 'inset');
    expect(container.querySelectorAll('[data-card-surface]')).toHaveLength(1);
  });

  it('supports an explicit frame surface for standalone contexts', () => {
    const { container } = render(
      <StatCard
        title="Contacts"
        badgeText="Total Contacts"
        value={3}
        icon={Circle}
        surface="frame"
      />,
    );

    expect(container.firstElementChild).toHaveAttribute('data-card-surface', 'frame');
  });

  it('makes raw numeric values responsive without losing their exact accessible value', () => {
    const { container } = render(
      <StatCard
        title="Contacts"
        badgeText="Total Contacts"
        value={11_543}
        icon={Circle}
      />,
    );

    expect(container.querySelector('[data-stat-card-value]')).toHaveClass('tabular-nums');
    expect(screen.getByLabelText('11,543')).toHaveAttribute('data-responsive-value-mode', 'full');
  });
});
