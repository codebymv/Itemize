import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/types';
import { CreateContactModal } from './CreateContactModal';

const contact = { id: 11, first_name: 'Ada' } as Contact;

describe('CreateContactModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains the creation key when an unchanged request is retried', async () => {
    const createContactAsync = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(contact);
    const onCreated = vi.fn();

    render(
      <CreateContactModal
        organizationId={42}
        onClose={vi.fn()}
        onCreated={onCreated}
        createContactAsync={createContactAsync}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'First Name' }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
    await waitFor(() => expect(createContactAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
    await waitFor(() => expect(createContactAsync).toHaveBeenCalledTimes(2));

    expect(createContactAsync.mock.calls[1][1]).toBe(createContactAsync.mock.calls[0][1]);
    expect(onCreated).toHaveBeenCalledWith(contact);
  });
});
