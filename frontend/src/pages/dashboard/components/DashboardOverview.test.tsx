import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Activity, AlertTriangle, Users } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSignal } from '../signals/dashboardSignalCatalog';
import { DashboardOverview } from './DashboardOverview';

const viewport = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => viewport.isMobile,
}));

const signals: DashboardSignal[] = [
  {
    id: 'contacts-total',
    title: 'Total contacts',
    catalogDescription: 'All contacts.',
    source: 'Contacts',
    route: '/contacts',
    icon: Users,
    theme: 'blue',
    value: '6',
    supportingText: '6 added this month',
    timeframe: 'Current',
    status: 'ready',
  },
  {
    id: 'tasks-overdue',
    title: 'Overdue tasks',
    catalogDescription: 'Tasks requiring action.',
    source: 'Workspace',
    route: '/canvas',
    icon: AlertTriangle,
    theme: 'red',
    value: '2',
    supportingText: '4 pending',
    timeframe: 'Current',
    status: 'ready',
    requiresAttention: true,
  },
  {
    id: 'deals-open',
    title: 'Open deals',
    catalogDescription: 'Current open deals.',
    source: 'Pipelines',
    route: '/pipelines',
    icon: Activity,
    theme: 'orange',
    value: '7',
    supportingText: '7 total',
    timeframe: 'Current',
    status: 'ready',
  },
];

describe('DashboardOverview', () => {
  beforeEach(() => {
    viewport.isMobile = false;
  });

  it('keeps the framed heading concise and uses the standard dashboard action height', () => {
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total']}
        onSavePinnedSignalIds={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Your most important outcomes, queues, and current conditions.')).not.toBeInTheDocument();
    const addSignals = screen.getByRole('button', { name: 'Add signals' });
    expect(addSignals).toHaveClass('h-10');
    expect(screen.getByRole('button', { name: /^Needs attention: Overdue tasks\./ })).toHaveClass('h-10');
    expect(addSignals.closest('[data-framed-section]')?.firstElementChild).toHaveClass('items-center');
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
    expect(screen.queryByText('1 of 8')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Open overview slot/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Open overview slot 2 of 8' })).toHaveTextContent(/Open slot\s*2\/8/);
  });

  it('supplements pins with attention without duplicating a pinned warning', () => {
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total', 'tasks-overdue']}
        onSavePinnedSignalIds={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.getAllByText('Overdue tasks')).toHaveLength(1);
  });

  it('keeps unpinned required attention visible and routes each signal', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total']}
        onSavePinnedSignalIds={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    const attentionFrame = screen.getByText('Needs attention').closest('.grid');
    expect(attentionFrame).toHaveClass('dashboard-overview-attention-body');
    expect(attentionFrame).toHaveClass('min-[520px]:grid-cols-[auto_minmax(0,1fr)]');
    expect(screen.getByText('4 pending')).toHaveClass('min-[520px]:inline');
    fireEvent.click(screen.getByRole('button', { name: /^Needs attention: Overdue tasks\./ }));
    expect(onNavigate).toHaveBeenCalledWith('/canvas');
  });

  it('moves pin management onto the real signal cells', () => {
    const onSave = vi.fn();
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total', 'tasks-overdue']}
        onSavePinnedSignalIds={onSave}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reorder Total contacts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Total contacts' }));
    expect(onSave).toHaveBeenCalledWith(['tasks-overdue']);
  });

  it('keeps the desktop popover focused only on finding and adding signals', () => {
    const onSave = vi.fn();
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total']}
        onSavePinnedSignalIds={onSave}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add signals' }));

    const dialog = screen.getByRole('dialog', { name: 'Add overview signals' });
    expect(dialog).toHaveAttribute('data-overview-signal-picker', 'popover');
    expect(within(dialog).queryByText('Pinned signals')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Current open deals.')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search overview signals' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter signals by module' })).toBeInTheDocument();
    expect(dialog.querySelector('[data-signal-picker-results]')).toHaveClass('overflow-y-auto');

    const openDealsRow = within(dialog).getByText('Open deals').closest('.border-b');
    expect(openDealsRow).not.toBeNull();
    fireEvent.click(within(openDealsRow as HTMLElement).getByRole('button', { name: 'Pin' }));
    expect(onSave).toHaveBeenCalledWith(['contacts-total', 'deals-open']);
    expect(screen.getByRole('dialog', { name: 'Add overview signals' })).toBeInTheDocument();
  });

  it('uses each remaining capacity slot as a direct path to the signal picker', () => {
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total', 'tasks-overdue']}
        onSavePinnedSignalIds={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    const slots = screen.getAllByRole('button', { name: /^Open overview slot/ });
    expect(slots).toHaveLength(6);
    expect(slots[0]).toHaveAccessibleName('Open overview slot 3 of 8');
    expect(slots[5]).toHaveAccessibleName('Open overview slot 8 of 8');

    fireEvent.click(slots[0]);
    expect(screen.getByRole('dialog', { name: 'Add overview signals' })).toBeInTheDocument();
  });

  it('uses the same picker body in a bottom sheet on mobile', () => {
    viewport.isMobile = true;
    render(
      <DashboardOverview
        signals={signals}
        pinnedSignalIds={['contacts-total']}
        onSavePinnedSignalIds={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add signals' }));

    const sheet = screen.getByRole('dialog', { name: 'Add overview signals' });
    expect(sheet).toHaveAttribute('data-overview-signal-picker', 'sheet');
    expect(within(sheet).getByRole('searchbox', { name: 'Search overview signals' })).toBeInTheDocument();
    expect(within(sheet).getByRole('combobox', { name: 'Filter signals by module' })).toBeInTheDocument();
  });
});
