import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getContact, getContacts } from './contactsApi';
import { getContactViaGraphql, getContactsViaGraphql } from './contactsGraphql';
import { isContactGraphqlReadsEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('./contactsGraphql', () => ({
  getContactViaGraphql: vi.fn(),
  getContactsViaGraphql: vi.fn(),
}));

vi.mock('./graphqlClient', () => ({
  isContactGraphqlReadsEnabled: vi.fn(),
}));

describe('contacts API read transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isContactGraphqlReadsEnabled).mockReturnValue(false);
  });

  it('uses REST by default and retains the organization header contract', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        contacts: [{ id: 11, first_name: 'Ada' }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
    });

    const result = await getContacts({ search: 'Ada', organization_id: 42 });

    expect(result.contacts[0]).toMatchObject({ id: 11, first_name: 'Ada' });
    expect(api.get).toHaveBeenCalledWith('/api/contacts', {
      params: { search: 'Ada', organization_id: 42 },
      headers: { 'x-organization-id': '42' },
    });
    expect(getContactsViaGraphql).not.toHaveBeenCalled();
  });

  it('routes list and detail reads through GraphQL only when enabled', async () => {
    vi.mocked(isContactGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(getContactsViaGraphql).mockResolvedValue({
      contacts: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    vi.mocked(getContactViaGraphql).mockResolvedValue({ id: 11 } as never);

    await getContacts({ page: 1 }, 42);
    await getContact(11, 42);

    expect(getContactsViaGraphql).toHaveBeenCalledWith({ page: 1 }, 42);
    expect(getContactViaGraphql).toHaveBeenCalledWith(11, 42);
    expect(api.get).not.toHaveBeenCalled();
  });
});
