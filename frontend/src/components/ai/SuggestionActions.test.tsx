import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionActions } from './SuggestionActions';

describe('SuggestionActions', () => {
  it('offers touch-friendly accept, regenerate, and dismiss actions', () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SuggestionActions
        suggestion="Confirm the launch date"
        onAccept={onAccept}
        onRegenerate={onRegenerate}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /accept suggestion/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate another/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss suggestion/i }));

    expect(onAccept).toHaveBeenCalledOnce();
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('makes provider failures visible and retryable', () => {
    const onRegenerate = vi.fn();
    render(
      <SuggestionActions
        error="AI suggestions are temporarily unavailable"
        onAccept={vi.fn()}
        onRegenerate={onRegenerate}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});
