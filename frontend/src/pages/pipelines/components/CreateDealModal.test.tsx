import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDealModal } from './CreateDealModal';

const apiMocks = vi.hoisted(() => ({
  createDeal: vi.fn(),
  getContacts: vi.fn(),
}));

vi.mock('@/services/pipelinesApi', () => ({
  createDeal: apiMocks.createDeal,
}));

vi.mock('@/services/contactsApi', () => ({
  getContacts: apiMocks.getContacts,
}));

describe('CreateDealModal', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getContacts.mockResolvedValue({
      contacts: [],
      pagination: {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  });

  it('renders the optional no-contact selection without an empty Radix value', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CreateDealModal
          pipelineId={1}
          stages={[{
            id: 'lead',
            name: 'Lead',
            color: '#3B82F6',
            order: 0,
          }]}
          organizationId={1}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('dialog', { name: 'Create New Deal' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Value ($)' })).toHaveAttribute(
      'step',
      '0.01',
    );
    fireEvent.click(screen.getByText('Select a contact (optional)'));
    expect(screen.getByText('No contact')).toBeInTheDocument();
  });

  it('retains the creation key when an unchanged request is retried', async () => {
    apiMocks.createDeal
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ id: 9, title: 'Expansion' });
    const onCreated = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CreateDealModal
          pipelineId={1}
          stages={[{ id: 'lead', name: 'Lead', color: '#3B82F6', order: 0 }]}
          organizationId={42}
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Deal Title *' }), {
      target: { value: 'Expansion' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value ($)' }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
    await waitFor(() => expect(apiMocks.createDeal).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
    await waitFor(() => expect(apiMocks.createDeal).toHaveBeenCalledTimes(2));

    expect(apiMocks.createDeal.mock.calls[1][1]).toBe(apiMocks.createDeal.mock.calls[0][1]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });
});
