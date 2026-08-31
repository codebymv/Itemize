import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchField } from './search-field';

describe('SearchField', () => {
  it('provides a labeled search control and clears its value', () => {
    const onValueChange = vi.fn();
    render(
      <SearchField
        label="Search campaigns"
        value="September"
        onValueChange={onValueChange}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search campaigns' })).toHaveValue('September');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search campaigns' }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('uses Escape to clear a populated search before the surrounding surface closes', () => {
    const onValueChange = vi.fn();
    render(
      <SearchField
        label="Search contacts"
        value="Maya"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search contacts' }), { key: 'Escape' });
    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
