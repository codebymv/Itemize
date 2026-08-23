import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RefreshButton } from './refresh-button';

describe('RefreshButton', () => {
  it('uses one accessible action with a mobile-collapsed label', () => {
    render(<RefreshButton />);

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveClass('w-10', 'sm:w-auto');
    expect(screen.getByText('Refresh')).toHaveClass('hidden', 'sm:inline');
  });

  it('disables and animates while refreshing', () => {
    render(<RefreshButton refreshing />);

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
  });
});
