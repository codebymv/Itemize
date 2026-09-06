import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContacts } from '@/services/contactsApi';
import {
  contactSuggestion,
  fetchContactSuggestions,
  resetEntitySuggestionCacheForTests,
  SUGGESTION_LIMIT,
} from './entitySuggestions';
import type { Contact } from '@/types';

vi.mock('@/services/contactsApi', () => ({
  getContacts: vi.fn(),
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
    resetEntitySuggestionCacheForTests();
  });

  it('builds rows with initials and a quieter detail that never repeats the label', () => {
    expect(contactSuggestion(contact({ id: 5, first_name: 'Casey', last_name: 'Sanchez', company: 'Sanchez Kitchens' })))
      .toEqual({ kind: 'contact', id: 5, label: 'Casey Sanchez', detail: 'Sanchez Kitchens', initials: 'CS' });
    expect(contactSuggestion(contact({ id: 6, company: 'North Roofing', email: 'ops@north.test' })))
      .toEqual({ kind: 'contact', id: 6, label: 'North Roofing', detail: 'ops@north.test', initials: 'NR' });
    expect(contactSuggestion(contact({ id: 7, email: 'solo@test' })).detail).toBeNull();
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
    expect(getContacts).toHaveBeenNthCalledWith(
      1,
      { search: 'cas', status: 'active', limit: SUGGESTION_LIMIT },
      9,
    );
  });

  it('sends no search for an empty query so the list opens with the top clients', async () => {
    vi.mocked(getContacts).mockResolvedValue({
      contacts: [],
      pagination: { page: 1, limit: SUGGESTION_LIMIT, total: 0, totalPages: 0 },
    });
    await fetchContactSuggestions('', 9);
    expect(getContacts).toHaveBeenCalledWith(
      { search: undefined, status: 'active', limit: SUGGESTION_LIMIT },
      9,
    );
  });
});
