import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileQueryBar } from './MobileQueryBar';

describe('MobileQueryBar', () => {
  it('keeps search, filters, and actions in one command lane', () => {
    const { container } = render(
      <MobileQueryBar
        search={<input aria-label="Search records" />}
        filters={<button type="button">Filter</button>}
        actions={<button type="button">Add</button>}
      />,
    );

    expect(screen.getByLabelText('Search records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(container.querySelector('[data-mobile-query-bar]')).toHaveClass('flex-nowrap');
  });
});
