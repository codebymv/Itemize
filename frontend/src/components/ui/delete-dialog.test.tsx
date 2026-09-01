import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteDialog } from './delete-dialog';

describe('DeleteDialog mutation lifecycle', () => {
  it('single-flights click and touch-equivalent confirmation events', async () => {
    let confirmDelete!: (value: boolean) => void;
    const onConfirm = vi.fn(() => new Promise<boolean>((resolve) => {
      confirmDelete = resolve;
    }));
    const onOpenChange = vi.fn();

    render(
      <DeleteDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        itemType="note"
        showToast={false}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete Note' });
    act(() => {
      fireEvent.click(deleteButton);
      fireEvent.click(deleteButton);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(deleteButton).toHaveAttribute('aria-busy', 'true');

    await act(async () => confirmDelete(true));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
