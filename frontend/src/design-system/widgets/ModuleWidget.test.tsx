import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleWidget } from './ModuleWidget';

const TestIcon = () => <span aria-hidden="true" />;

describe('ModuleWidget', () => {
  it('keeps compact summaries closed without rendering an expand control', () => {
    const onView = vi.fn();

    render(
      <ModuleWidget
        title="Invoices"
        icon={TestIcon}
        primaryStat={2}
        primaryStatLabel="Pending"
        recentItems={[{ id: '1', title: 'INV-00001' }]}
        action={{ label: 'View Invoices', onClick: onView }}
        compact
      />,
    );

    expect(screen.queryByRole('button', { name: 'Toggle collapse' })).not.toBeInTheDocument();
    expect(screen.queryByText('INV-00001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Invoices' }));
    expect(onView).toHaveBeenCalledOnce();
  });

  it('retains expandable recent items outside compact mode', () => {
    const onToggleCollapse = vi.fn();

    render(
      <ModuleWidget
        title="Invoices"
        icon={TestIcon}
        primaryStat={2}
        recentItems={[{ id: '1', title: 'INV-00001' }]}
        isCollapsed
        onToggleCollapse={onToggleCollapse}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle collapse' }));

    expect(screen.getByText('INV-00001')).toBeInTheDocument();
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it('can shorten an action visually below the wide breakpoint without changing its name', () => {
    render(
      <ModuleWidget
        title="Invoices"
        icon={TestIcon}
        primaryStat={2}
        action={{ label: 'View Invoices', compactLabel: 'View', onClick: vi.fn() }}
      />,
    );

    expect(screen.getByRole('button', { name: 'View Invoices' })).toBeInTheDocument();
    expect(screen.getByText('View')).toHaveClass('min-[1750px]:hidden');
    expect(screen.getByText('View Invoices')).toHaveClass('hidden', 'min-[1750px]:inline');
  });
});
