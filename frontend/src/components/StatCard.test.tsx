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
});
