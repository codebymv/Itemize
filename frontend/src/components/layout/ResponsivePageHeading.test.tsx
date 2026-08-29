import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResponsivePageHeading } from './ResponsivePageHeading';

describe('ResponsivePageHeading', () => {
  it('accepts scoped layout overrides without changing the heading text contract', () => {
    render(
      <ResponsivePageHeading
        title="NOTIFICATIONS"
        className="w-auto md:ml-0"
      />,
    );

    const heading = screen.getByRole('heading', { name: 'NOTIFICATIONS' });
    expect(heading.parentElement).toHaveClass('w-auto', 'md:ml-0');
    expect(heading).toHaveClass('whitespace-normal', 'md:whitespace-nowrap');
  });
});
