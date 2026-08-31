import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LoadingState } from '@/components/LoadingState';
import { PageLoading } from '@/components/ui/page-loading';
import { SaveStatus } from '@/components/ui/save-status';

describe('general state primitives', () => {
  it('announces one named section load without exposing its decorative spinner', () => {
    const { container } = render(
      <LoadingState kind="section" message="Loading contacts" />,
    );

    const state = screen.getByRole('status', { name: 'Loading contacts' });
    expect(state).toHaveAttribute('data-loading-state', 'section');
    expect(state).toHaveAttribute('aria-busy', 'true');
    expect(state).toHaveAttribute('aria-live', 'polite');
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('keeps the legacy page loader on the shared route-sized state', () => {
    render(<PageLoading message="Loading campaign" />);

    expect(screen.getByRole('status', { name: 'Loading campaign' }))
      .toHaveAttribute('data-loading-state', 'page');
  });

  it('makes saving polite and busy, then makes failure assertive and retryable', () => {
    const retry = vi.fn();
    const { rerender } = render(<SaveStatus state="saving" />);

    const saving = screen.getByRole('status');
    expect(saving).toHaveTextContent('Saving…');
    expect(saving).toHaveAttribute('data-save-state', 'saving');
    expect(saving).toHaveAttribute('aria-busy', 'true');
    expect(saving).toHaveAttribute('aria-live', 'polite');

    rerender(<SaveStatus state="error" onRetry={retry} />);
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Save failed');
    expect(error).toHaveAttribute('aria-live', 'assertive');
  });
});
