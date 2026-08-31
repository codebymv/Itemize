import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { FramedSection } from '@/components/ui/framed-section';
import { StatCard } from '@/components/StatCard';

describe('FramedSection', () => {
  it('creates a labeled frame with a page-level section heading and accent icon', () => {
    const { container } = render(
      <FramedSection title="Overview" icon={Users} action={<button type="button">View</button>}>
        <p>Section content</p>
      </FramedSection>,
    );

    const region = screen.getByRole('region', { name: 'Overview' });
    expect(region).toHaveAttribute('data-card-surface', 'frame');
    expect(region).toHaveAttribute('data-framed-section');
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeInTheDocument();
    expect(container.querySelector('.icon-accent')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
  });

  it('supports deeper heading levels without changing the visual primitive', () => {
    render(
      <FramedSection title="Delivery" icon={Users} headingLevel={3}>
        <p>Section content</p>
      </FramedSection>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Delivery' })).toBeInTheDocument();
  });

  it('creates frame-to-inset contrast with the default stat surface', () => {
    render(
      <FramedSection title="Overview" icon={Users}>
        <StatCard title="Contacts" badgeText="Total" value={3} icon={Users} />
      </FramedSection>,
    );

    expect(screen.getByRole('region', { name: 'Overview' }))
      .toHaveAttribute('data-card-surface', 'frame');
    expect(screen.getByRole('group', { name: 'Contacts' }))
      .toHaveAttribute('data-card-surface', 'inset');
  });

  it('provides the standard inset body for forms, previews, and tables', () => {
    render(
      <FramedSection title="Campaign setup" icon={Users} contentSurface="inset">
        <label htmlFor="name">Name</label>
        <input id="name" />
      </FramedSection>,
    );

    expect(screen.getByRole('region', { name: 'Campaign setup' })
      .querySelector('[data-card-content-surface="inset"]'))
      .toBeInTheDocument();
  });
});
