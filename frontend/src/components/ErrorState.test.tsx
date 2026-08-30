import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertTriangle } from 'lucide-react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('announces a recoverable section failure and retries', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Unable to load invoices"
        description="We couldn't load invoices. Try again."
        onRetry={onRetry}
      />,
    );

    const state = screen.getByRole('alert');
    expect(state).toHaveAttribute('data-error-state', 'section');
    expect(state).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('type', 'button');
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy action callback compatible', () => {
    const onAction = vi.fn();
    render(<ErrorState title="Unable to load" onAction={onAction} />);
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('uses compact density for inline failures', () => {
    render(<ErrorState kind="inline" title="Preview unavailable" icon={AlertTriangle} />);

    expect(screen.getByRole('heading', { name: 'Preview unavailable' })).toHaveClass('text-sm');
    expect(screen.getByRole('alert')).toHaveAttribute('data-error-state', 'inline');
  });

  it('supports a custom recovery action without losing spacing', () => {
    render(
      <ErrorState
        kind="page"
        title="Page unavailable"
        action={<button type="button">Return</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Return' }).parentElement).toHaveClass('mt-4');
  });
});
