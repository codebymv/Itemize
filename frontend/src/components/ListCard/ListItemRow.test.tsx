import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListItemRow } from './ListItemRow';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

describe('ListItemRow', () => {
  it('exposes completion as a keyboard-operable checkbox', () => {
    const toggleItemCompleted = vi.fn();
    render(
      <ListItemRow
        item={{ id: 'item-1', text: 'Verify release', completed: false }}
        editingItemId={null}
        editingItemText=""
        setEditingItemText={vi.fn()}
        toggleItemCompleted={toggleItemCompleted}
        startEditingItem={vi.fn()}
        handleEditItem={vi.fn()}
        removeItem={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Mark complete: Verify release' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    fireEvent.keyDown(checkbox, { key: 'Enter' });
    fireEvent.click(checkbox);
    expect(toggleItemCompleted).toHaveBeenCalledWith('item-1');
  });

  it('names the edit and delete actions', () => {
    render(
      <ListItemRow
        item={{ id: 'item-1', text: 'Verify release', completed: false }}
        editingItemId={null}
        editingItemText=""
        setEditingItemText={vi.fn()}
        toggleItemCompleted={vi.fn()}
        startEditingItem={vi.fn()}
        handleEditItem={vi.fn()}
        removeItem={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit Verify release' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Verify release' })).toBeInTheDocument();
  });
});
