import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContacts } from '@/services/contactsApi';
import type { Contact } from '@/types';
import { ContactCatalogPicker } from './ContactCatalogPicker';

vi.mock('@/services/contactsApi', () => ({ getContacts: vi.fn() }));

const contact: Contact = {
  id: 7,
  organization_id: 4,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  company: 'Analytical Engines',
  address: {},
  source: 'manual',
  status: 'active',
  custom_fields: {},
  tags: [],
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

describe('ContactCatalogPicker', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => vi.clearAllMocks());

  it('loads lazily, pages explicitly, and returns the selected contact', async () => {
    vi.mocked(getContacts)
      .mockResolvedValueOnce({
        contacts: [contact],
        pagination: { page: 1, limit: 25, total: 2, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        contacts: [{ ...contact, id: 8, first_name: 'Grace', last_name: 'Hopper' }],
        pagination: { page: 2, limit: 25, total: 2, totalPages: 2 },
      });
    const onSelect = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ContactCatalogPicker organizationId={4} selectedContact={null} onSelect={onSelect} />
      </QueryClientProvider>,
    );

    expect(getContacts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(getContacts).toHaveBeenCalledWith(expect.objectContaining({
      page: 1, limit: 25, sort_by: 'first_name', sort_order: 'asc',
    }), 4, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole('button', { name: 'Load more contacts' }));
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    await waitFor(() => expect(getContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, limit: 25 }),
      4,
      expect.any(AbortSignal),
    ));
    fireEvent.click(screen.getByText('Grace Hopper'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
  });
});
