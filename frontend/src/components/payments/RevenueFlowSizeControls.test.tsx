import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RevenueFlowSizeControls } from './RevenueFlowSizeControls';

describe('RevenueFlowSizeControls', () => {
  it('starts at the minimum height with zoom out disabled', () => {
    render(<RevenueFlowSizeControls size="compact" onSizeChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Zoom out revenue chart' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom in revenue chart' })).toBeEnabled();
    expect(screen.getByText('Compact revenue chart height')).toHaveClass('sr-only');
  });

  it('steps through the declared chart heights', () => {
    const onSizeChange = vi.fn();
    const { rerender } = render(<RevenueFlowSizeControls size="standard" onSizeChange={onSizeChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out revenue chart' }));
    expect(onSizeChange).toHaveBeenLastCalledWith('compact');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in revenue chart' }));
    expect(onSizeChange).toHaveBeenLastCalledWith('expanded');

    rerender(<RevenueFlowSizeControls size="expanded" onSizeChange={onSizeChange} />);
    expect(screen.getByRole('button', { name: 'Zoom in revenue chart' })).toBeDisabled();
  });
});
