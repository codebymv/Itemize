import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getContacts.mockResolvedValue({
      contacts: [],
      pagination: {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  });

  it('renders the optional no-contact selection without an empty Radix value', () => {
    render(
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
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Create New Deal' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Value ($)' })).toHaveAttribute(
      'step',
      '0.01',
    );
    expect(screen.getAllByText('No contact')).not.toHaveLength(0);
  });
});
