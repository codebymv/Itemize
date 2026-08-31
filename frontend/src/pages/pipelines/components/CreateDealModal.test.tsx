import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
