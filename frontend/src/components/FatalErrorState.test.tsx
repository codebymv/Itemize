import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FatalErrorState } from './FatalErrorState';

describe('FatalErrorState', () => {
  it('offers one recovery action and one safe exit', () => {
    const onRetry = vi.fn();
    const onGoHome = vi.fn();
    render(<FatalErrorState onRetry={onRetry} onGoHome={onGoHome} />);

    expect(screen.getByRole('alert')).toHaveAttribute('data-error-state', 'page');
    screen.getByRole('button', { name: 'Refresh page' }).click();
    screen.getByRole('button', { name: 'Dashboard' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
