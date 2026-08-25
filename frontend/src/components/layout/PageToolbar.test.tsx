import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageToolbar } from './PageToolbar';

describe('PageToolbar', () => {
  it('groups query controls and result context beneath the page header', () => {
    render(
      <PageToolbar
        label="Content controls"
        search={<input aria-label="Search content" />}
        filters={<button type="button">Type</button>}
        meta={<span>2 items</span>}
        actions={<button type="button">Clear</button>}
      />,
    );

    const toolbar = screen.getByRole('region', { name: 'Content controls' });
    expect(toolbar).toContainElement(screen.getByRole('textbox', { name: 'Search content' }));
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Type' }));
    expect(toolbar).toHaveTextContent('2 items');
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Clear' }));
  });
});
