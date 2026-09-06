import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContacts } from '@/services/contactsApi';
import { graphqlRequest } from '@/services/graphqlClient';
import {
  contactSuggestion,
  fetchContactSuggestions,
  fetchMoneySuggestions,
  moneySuggestion,
  resetEntitySuggestionCacheForTests,
  SUGGESTION_LIMIT,
} from './entitySuggestions';
import type { Contact } from '@/types';

vi.mock('@/services/contactsApi', () => ({
  getContacts: vi.fn(),
}));
vi.mock('@/services/graphqlClient', () => ({
  graphqlRequest: vi.fn(),
}));

const contact = (values: Partial<Contact>): Contact => ({
  id: 1,
  organization_id: 9,
  address: {},
  source: 'manual',
  status: 'active',
  custom_fields: {},
  tags: [],
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
  ...values,
} as Contact);

describe('entitySuggestions', () => {
  beforeEach(() => {
    vi.mocked(getContacts).mockReset();
    vi.mocked(graphqlRequest).mockReset();
    resetEntitySuggestionCacheForTests();
  });

  it('builds client rows with initials and a quieter detail that never repeats the label', () => {
    expect(contactSuggestion(contact({ id: 5, first_name: 'Casey', last_name: 'Sanchez', company: 'Sanchez Kitchens' })))
      .toEqual({ kind: 'contact', id: 5, label: 'Casey Sanchez', detail: 'Sanchez Kitchens', initials: 'CS' });
    expect(contactSuggestion(contact({ id: 6, company: 'North Roofing', email: 'ops@north.test' })))
      .toEqual({ kind: 'contact', id: 6, label: 'North Roofing', detail: 'ops@north.test', initials: 'NR' });
    expect(contactSuggestion(contact({ id: 7, email: 'solo@test' })).detail).toBeNull();
  });

  it('builds money rows with the customer and amount as detail and the status alongside', () => {
    expect(moneySuggestion({
      entityType: 'invoice', entityId: 4, label: 'INV-0012', detail: 'Casey Sanchez',
      status: 'sent', total: '1250.5', currency: 'usd', contactId: 5,
    })).toEqual({
      kind: 'invoice', id: 4, label: 'INV-0012', detail: 'Casey Sanchez · $1,250.50', initials: 'IN', status: 'sent',
    });
    expect(moneySuggestion({
      entityType: 'payment', entityId: 8, label: 'Payment on INV-0012', detail: null,
      status: 'succeeded', total: null, currency: null, contactId: null,
    }).detail).toBeNull();
  });

  it('asks the server with the trigger query scoped to active clients and caches per organization', async () => {
    vi.mocked(getContacts).mockResolvedValue({
      contacts: [contact({ id: 5, first_name: 'Casey', last_name: 'Sanchez' })],
      pagination: { page: 1, limit: SUGGESTION_LIMIT, total: 1, totalPages: 1 },
    });

    const first = await fetchContactSuggestions('cas', 9);
    const again = await fetchContactSuggestions('Cas ', 9);
    const otherOrg = await fetchContactSuggestions('cas', 10);

    expect(first).toEqual([expect.objectContaining({ id: 5, label: 'Casey Sanchez' })]);
    expect(again).toBe(first);
    expect(otherOrg).toEqual(first);
    expect(getContacts).toHaveBeenCalledTimes(2);
    expect(getContacts).toHaveBeenNthCalledWith(1, { search: 'cas', status: 'active', limit: SUGGESTION_LIMIT }, 9);
  });

  it('asks for money documents scoped to the bound client and caches per client', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      moneyDocumentSuggestions: [{
        entityType: 'estimate', entityId: 9, label: 'EST-3', detail: 'Casey Sanchez',
        status: 'draft', total: '300', currency: 'USD', contactId: 5,
      }],
    });
    const rows = await fetchMoneySuggestions('est', 9, 5);
    await fetchMoneySuggestions('est', 9, 5);
    expect(rows).toEqual([expect.objectContaining({ kind: 'estimate', id: 9, label: 'EST-3', status: 'draft' })]);
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('moneyDocumentSuggestions'),
      { query: 'est', contactId: 5 },
      9,
    );
  });
});
