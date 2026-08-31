import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Palette, Save, Settings } from 'lucide-react';
import {
  DesktopHeaderTools,
  HeaderAction,
  HeaderFilters,
  HeaderModeNavigation,
  HeaderRefreshAction,
  HeaderSearch,
  ResponsiveHeaderTools,
} from './DesktopHeaderTools';

describe('ResponsiveHeaderTools', () => {
  it('promotes a lone secondary command into the primary action in both shell renderers', () => {
    const { container } = render(
      <TooltipProvider>
        <ResponsiveHeaderTools
          secondaryAction={(
            <HeaderAction
              prominence="secondary"
              label="Canvas"
              icon={<Palette />}
              onClick={vi.fn()}
            />
          )}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector('[data-responsive-header-tools]')).toHaveClass(
      'desktop-header-tools',
      'desktop-header-tools--responsive',
    );
    expect(screen.getAllByRole('button', { name: 'Canvas' })).toHaveLength(2);
    expect(container.querySelectorAll('[data-promoted-primary]')).toHaveLength(2);
    screen.getAllByRole('button', { name: 'Canvas' }).forEach((button) => {
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
      expect(button).not.toHaveClass('border-input');
    });
  });

  it('keeps query, secondary, and primary commands in one three-control mobile rail', () => {
    const { container } = render(
      <TooltipProvider>
        <ResponsiveHeaderTools
          combinedQuery={<button type="button">Search and filter</button>}
          secondaryAction={<button type="button">More contact actions</button>}
          primaryAction={<button type="button">Add contact</button>}
        />
      </TooltipProvider>,
    );

    const mobile = container.querySelector('[data-mobile-header-tools]');
    expect(mobile?.querySelectorAll('button')).toHaveLength(3);
    expect(mobile).toHaveTextContent('Search and filter');
    expect(mobile).toHaveTextContent('More contact actions');
    expect(mobile).toHaveTextContent('Add contact');
    expect(mobile?.querySelector('[aria-label="More page actions"]')).toBeNull();
  });

  it('hands status off to the detail header when mode and primary action need the rail', () => {
    const { container } = render(
      <TooltipProvider>
        <ResponsiveHeaderTools
          modeNavigation={<button type="button">Appearance</button>}
          status={<span>Inactive</span>}
          primaryAction={<button type="button">Save changes</button>}
        />
      </TooltipProvider>,
    );

    const mobile = container.querySelector('[data-mobile-header-tools]');
    expect(mobile?.querySelectorAll('button')).toHaveLength(2);
    expect(mobile?.querySelector('[aria-label="More page actions"]')).not.toBeInTheDocument();
    expect(mobile).not.toHaveTextContent('Inactive');
  });

  it('collapses multi-action secondary groups before truncating the mobile title', () => {
    const { container } = render(
      <TooltipProvider>
        <ResponsiveHeaderTools
          secondaryAction={(
            <div>
              <button type="button">Runs</button>
              <button type="button">Deactivate</button>
            </div>
          )}
          primaryAction={<button type="button">Save automation</button>}
        />
      </TooltipProvider>,
    );

    const mobile = container.querySelector('[data-mobile-header-tools]');
    expect(mobile?.querySelectorAll('button')).toHaveLength(2);
    expect(mobile?.querySelector('[aria-label="More page actions"]')).toBeInTheDocument();
    expect(mobile).not.toHaveTextContent('Runs');
    expect(mobile).toHaveTextContent('Save automation');
  });

  it('counts fragment action groups as separate mobile commands', () => {
    const { container } = render(
      <TooltipProvider>
        <ResponsiveHeaderTools
          secondaryAction={(
            <>
              <button type="button">Preview</button>
              <button type="button">Publish</button>
            </>
          )}
          primaryAction={<button type="button">Save page</button>}
        />
      </TooltipProvider>,
    );

    const mobile = container.querySelector('[data-mobile-header-tools]');
    expect(mobile?.querySelectorAll('button')).toHaveLength(2);
    expect(mobile?.querySelector('[aria-label="More page actions"]')).toBeInTheDocument();
    expect(mobile).not.toHaveTextContent('Preview');
    expect(mobile).not.toHaveTextContent('Publish');
    expect(mobile).toHaveTextContent('Save page');
  });
});

describe('HeaderModeNavigation', () => {
  const items = [
    { value: 'settings', label: 'Settings', icon: Settings },
    { value: 'appearance', label: 'Appearance', icon: Palette },
  ];

  it('renders persistent editor modes in the typed shell slot', () => {
    const { container } = render(
      <TooltipProvider>
        <DesktopHeaderTools
          modeNavigation={(
            <HeaderModeNavigation
              label="Editor mode"
              value="settings"
              onValueChange={vi.fn()}
              items={items}
            />
          )}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-tools__mode')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Editor mode' })).toHaveClass('gap-0.5');
    expect(screen.getByRole('tab', { name: 'Settings' }))
      .toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveClass('gap-0.5', 'px-1');
    expect(screen.getByRole('button', { name: 'Editor mode: Settings' })).toBeInTheDocument();
  });

  it('uses the compact selector to change modes without losing labels', () => {
    const onValueChange = vi.fn();
    render(
      <TooltipProvider>
        <HeaderModeNavigation
          label="Editor mode"
          value="settings"
          onValueChange={onValueChange}
          items={items}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editor mode: Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Appearance' }));

    expect(onValueChange).toHaveBeenCalledWith('appearance');
  });
});

describe('HeaderSearch', () => {
  it('marks longer dataset searches to claim available shell width', () => {
    const { container } = render(
      <TooltipProvider>
        <HeaderSearch
          label="Search documents"
          placeholder="Search documents..."
          value=""
          onChange={vi.fn()}
          width="wide"
        />
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-search__wide')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search documents' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Search documents' })).toHaveLength(2);
    expect(container.querySelector('.desktop-header-search__label')).toHaveTextContent('Search');
  });
});

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
    expect(button).toHaveClass('h-11', 'min-w-11', 'bg-primary', 'interaction-button--primary');
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

    const button = screen.getByRole('button', { name: 'Refreshing' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-busy');
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('promotes a secondary refresh when it is the only page action', () => {
    const { container } = render(
      <TooltipProvider>
        <DesktopHeaderTools
          secondaryAction={(
            <HeaderRefreshAction prominence="secondary" onClick={vi.fn()} />
          )}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(container.querySelector('[data-promoted-primary]')).toContainElement(button);
    expect(button).toHaveClass('bg-primary', 'text-primary-foreground', 'interaction-button--primary');
    expect(button).not.toHaveClass('border-input');
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
    expect(button).toHaveClass('h-11', 'min-w-11', 'bg-primary', 'interaction-button--primary');
  });

  it('owns the mutation state and prevents duplicate activation while busy', () => {
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <HeaderAction
          label="Saving…"
          icon={<Save data-testid="busy-save-icon" />}
          onClick={onClick}
          busy
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-busy');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('DesktopHeaderTools status', () => {
  it('renders entity state in the typed, width-aware shell slot', () => {
    const { container } = render(
      <TooltipProvider>
        <DesktopHeaderTools status={<span>Active</span>} />
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-tools__status')).toHaveTextContent('Active');
    expect(container.querySelector('.desktop-header-tools__status')).toHaveClass('flex', 'shrink-0');
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

  it('can expose a short current value instead of an ambiguous compact filter icon', () => {
    render(
      <TooltipProvider>
        <HeaderFilters label="Performance period" compactLabel="30d">
          <div>Period dropdown</div>
        </HeaderFilters>
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Performance period: 30d' })).toHaveTextContent('30d');
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

  it('can defer a wider secondary filter until the complete lane fits', () => {
    const { container } = render(
      <TooltipProvider>
        <HeaderFilters label="Filter status" preferExpanded="wide-lane">
          <div>Status dropdown</div>
        </HeaderFilters>
      </TooltipProvider>,
    );

    expect(container.querySelector('.desktop-header-filters__full')).toHaveClass(
      'desktop-header-filters__full--wide-lane',
    );
    expect(container.querySelector('.desktop-header-filters__compact')).toHaveClass(
      'desktop-header-filters__compact--wide-lane',
    );
  });
});
