import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Save } from 'lucide-react';
import {
  DesktopHeaderTools,
  HeaderAction,
  HeaderFilters,
  HeaderRefreshAction,
} from './DesktopHeaderTools';

describe('HeaderRefreshAction', () => {
  it('uses the typed primary-action slot and responsive action label', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <DesktopHeaderTools
          primaryAction={<HeaderRefreshAction onClick={onClick} />}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(container.querySelector('.desktop-header-tools__primary')).toContainElement(button);
    expect(button).toHaveClass('h-11', 'min-w-11', 'bg-blue-600');
    expect(screen.getByText('Refresh')).toHaveClass('desktop-header-action-label');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and spins while refreshing', () => {
    render(
      <TooltipProvider>
        <HeaderRefreshAction onClick={vi.fn()} refreshing />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('supports secondary refresh prominence without changing its responsive grammar', () => {
    render(
      <TooltipProvider>
        <DesktopHeaderTools
          secondaryAction={(
            <HeaderRefreshAction prominence="secondary" onClick={vi.fn()} />
          )}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveClass('border', 'bg-background');
    expect(button).not.toHaveClass('bg-blue-600');
    expect(screen.getByText('Refresh')).toHaveClass('desktop-header-action-label');
  });
});

describe('HeaderAction', () => {
  it('renders a typed primary shell action with an icon and responsive label', () => {
    render(
      <TooltipProvider>
        <DesktopHeaderTools
          primaryAction={(
            <HeaderAction
              label="Save changes"
              icon={<Save data-testid="save-icon" />}
              onClick={vi.fn()}
            />
          )}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button).toContainElement(screen.getByTestId('save-icon'));
    expect(screen.getByText('Save changes')).toHaveClass('desktop-header-action-label');
    expect(button).toHaveClass('h-11', 'min-w-11', 'bg-blue-600');
  });
});

describe('HeaderFilters', () => {
  it('supports a popover-specific arrangement without changing the full filter row', () => {
    const { container } = render(
      <TooltipProvider>
        <HeaderFilters
          label="Filter users"
          activeCount={2}
          compactChildren={<div>Compact filter grid</div>}
        >
          <div>Full filter row</div>
        </HeaderFilters>
      </TooltipProvider>,
    );

    expect(screen.getByText('Full filter row')).toBeInTheDocument();
    expect(screen.queryByText('Compact filter grid')).not.toBeInTheDocument();
    expect(container.querySelector('[data-badge]')).toHaveClass('bg-blue-600');

    fireEvent.click(screen.getByRole('button', { name: 'Filter users' }));

    expect(screen.getByText('Compact filter grid')).toBeInTheDocument();
  });

  it('can prioritize one compact filter when the shell has room', () => {
    const { container } = render(
      <TooltipProvider>
        <HeaderFilters label="Filter period" preferExpanded>
          <div>Period dropdown</div>
        </HeaderFilters>
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-filters__full')).toHaveClass(
      'desktop-header-filters__full--priority',
    );
    expect(container.querySelector('.desktop-header-filters__compact')).toHaveClass(
      'desktop-header-filters__compact--priority',
    );
  });

  it('can defer a second high-value filter until the shell is roomy', () => {
    const { container } = render(
      <TooltipProvider>
        <HeaderFilters label="Filter type" preferExpanded="when-roomy">
          <div>Type dropdown</div>
        </HeaderFilters>
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-filters__full')).toHaveClass(
      'desktop-header-filters__full--roomy',
    );
    expect(container.querySelector('.desktop-header-filters__compact')).toHaveClass(
      'desktop-header-filters__compact--roomy',
    );
  });
});
