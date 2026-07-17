import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { createContact, deleteContact, getContact, getContacts, updateContact } from './contactsApi';
import {
  createContactViaGraphql,
  deleteContactViaGraphql,
  getContactViaGraphql,
  getContactsViaGraphql,
  updateContactViaGraphql,
} from './contactsGraphql';
import { isContactGraphqlMutationsEnabled, isContactGraphqlReadsEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./contactsGraphql', () => ({
  getContactViaGraphql: vi.fn(),
  getContactsViaGraphql: vi.fn(),
  createContactViaGraphql: vi.fn(),
  updateContactViaGraphql: vi.fn(),
  deleteContactViaGraphql: vi.fn(),
}));

vi.mock('./graphqlClient', () => ({
  isContactGraphqlReadsEnabled: vi.fn(),
  isContactGraphqlMutationsEnabled: vi.fn(),
}));

describe('contacts API read transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isContactGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isContactGraphqlMutationsEnabled).mockReturnValue(false);
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

  it('keeps contact writes on REST by default with organization headers', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 12, first_name: 'Grace' } });
    vi.mocked(api.put).mockResolvedValue({ data: { id: 12, first_name: 'Grace Updated' } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });

    await createContact({ first_name: 'Grace', organization_id: 42 });
    await updateContact(12, { first_name: 'Grace Updated', organization_id: 42 });
    await deleteContact(12, 42);

    expect(api.post).toHaveBeenCalledWith('/api/contacts', {
      first_name: 'Grace', organization_id: 42,
    }, { headers: { 'x-organization-id': '42' } });
    expect(api.put).toHaveBeenCalledWith('/api/contacts/12', {
      first_name: 'Grace Updated', organization_id: 42,
    }, { headers: { 'x-organization-id': '42' } });
    expect(api.delete).toHaveBeenCalledWith('/api/contacts/12', {
      headers: { 'x-organization-id': '42' },
    });
    expect(createContactViaGraphql).not.toHaveBeenCalled();
  });

  it('routes writes through GraphQL only when the mutation flag is enabled', async () => {
    vi.mocked(isContactGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(createContactViaGraphql).mockResolvedValue({ id: 12 } as never);
    vi.mocked(updateContactViaGraphql).mockResolvedValue({ id: 12 } as never);
    vi.mocked(deleteContactViaGraphql).mockResolvedValue();
    const input = { first_name: 'Grace', organization_id: 42 };

    await createContact(input);
    await updateContact(12, input);
    await deleteContact(12, 42);

    expect(createContactViaGraphql).toHaveBeenCalledWith(input);
    expect(updateContactViaGraphql).toHaveBeenCalledWith(12, input);
    expect(deleteContactViaGraphql).toHaveBeenCalledWith(12, 42);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
