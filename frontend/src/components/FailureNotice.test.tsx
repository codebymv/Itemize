import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FailureNotice } from './FailureNotice';

describe('FailureNotice', () => {
  it('preserves surrounding content while exposing recovery', () => {
    const onRetry = vi.fn();
    render(<FailureNotice title="Some results couldn't be loaded" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveAttribute('data-failure-notice');
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
