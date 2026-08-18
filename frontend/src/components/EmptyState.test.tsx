import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a default empty with action', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={Inbox}
        title="No items yet"
        description="Create your first item"
        actionLabel="Create Item"
        onAction={onAction}
      />
    );

    expect(screen.getByRole('heading', { name: 'No items yet' })).toHaveClass('text-lg');
    expect(screen.getByText('Create your first item')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Create Item' }).click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders a compact empty for nested cards', () => {
    render(
      <EmptyState icon={Inbox} title="No recipients yet" size="compact" />
    );

    expect(screen.getByRole('heading', { name: 'No recipients yet' })).toHaveClass('text-sm');
  });
});
