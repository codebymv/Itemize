import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useResponsiveContentCollapse } from './useResponsiveContentCollapse';

function CollapseHarness({ isMobile }: { isMobile: boolean }) {
  const collapse = useResponsiveContentCollapse(isMobile);

  return (
    <>
      <div data-testid="list-state">
        {collapse.isCollapsed('list', 'list-1') ? 'collapsed' : 'expanded'}
      </div>
      <div data-testid="note-state">
        {collapse.isCollapsed('note', 2) ? 'collapsed' : 'expanded'}
      </div>
      <button onClick={() => collapse.toggle('list', 'list-1')}>Toggle list</button>
      <button onClick={() => collapse.toggle('note', 2)}>Toggle note</button>
    </>
  );
}

describe('useResponsiveContentCollapse', () => {
  it('starts compact on mobile and keeps only one editor expanded', () => {
    render(<CollapseHarness isMobile />);

    expect(screen.getByTestId('list-state')).toHaveTextContent('collapsed');
    expect(screen.getByTestId('note-state')).toHaveTextContent('collapsed');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle list' }));
    expect(screen.getByTestId('list-state')).toHaveTextContent('expanded');
    expect(screen.getByTestId('note-state')).toHaveTextContent('collapsed');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle note' }));
    expect(screen.getByTestId('list-state')).toHaveTextContent('collapsed');
    expect(screen.getByTestId('note-state')).toHaveTextContent('expanded');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle note' }));
    expect(screen.getByTestId('note-state')).toHaveTextContent('collapsed');
  });

  it('starts expanded on desktop and collapses cards independently', () => {
    render(<CollapseHarness isMobile={false} />);

    expect(screen.getByTestId('list-state')).toHaveTextContent('expanded');
    expect(screen.getByTestId('note-state')).toHaveTextContent('expanded');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle list' }));
    expect(screen.getByTestId('list-state')).toHaveTextContent('collapsed');
    expect(screen.getByTestId('note-state')).toHaveTextContent('expanded');
  });
});
