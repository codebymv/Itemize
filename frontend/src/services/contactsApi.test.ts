import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  addContactActivity,
  bulkDeleteContacts,
  bulkUpdateContacts,
  createContact,
  deleteContact,
  getContact,
  getContactActivities,
  getContacts,
  updateContact,
} from './contactsApi';
import {
  addContactActivityViaGraphql,
  bulkDeleteContactsViaGraphql,
  bulkUpdateContactsViaGraphql,
  createContactViaGraphql,
  deleteContactViaGraphql,
  getContactViaGraphql,
  getContactActivitiesViaGraphql,
  getContactsViaGraphql,
  updateContactViaGraphql,
} from './contactsGraphql';
import {
  isContactGraphqlActivitiesEnabled,
  isContactGraphqlBulkMutationsEnabled,
  isContactGraphqlMutationsEnabled,
  isContactGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./contactsGraphql', () => ({
  addContactActivityViaGraphql: vi.fn(),
  bulkDeleteContactsViaGraphql: vi.fn(),
  bulkUpdateContactsViaGraphql: vi.fn(),
  getContactViaGraphql: vi.fn(),
  getContactActivitiesViaGraphql: vi.fn(),
  getContactsViaGraphql: vi.fn(),
  createContactViaGraphql: vi.fn(),
  updateContactViaGraphql: vi.fn(),
  deleteContactViaGraphql: vi.fn(),
}));

vi.mock('./graphqlClient', () => ({
  isContactGraphqlActivitiesEnabled: vi.fn(),
  isContactGraphqlBulkMutationsEnabled: vi.fn(),
  isContactGraphqlReadsEnabled: vi.fn(),
  isContactGraphqlMutationsEnabled: vi.fn(),
}));

describe('contacts API read transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isContactGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isContactGraphqlMutationsEnabled).mockReturnValue(false);
    vi.mocked(isContactGraphqlBulkMutationsEnabled).mockReturnValue(false);
    vi.mocked(isContactGraphqlActivitiesEnabled).mockReturnValue(false);
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

  it('keeps bulk writes on REST unless their independent flag is enabled', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { updated_ids: [11], message: '1 contacts updated' } })
      .mockResolvedValueOnce({ data: { deleted_ids: [11], message: '1 contacts deleted' } });
    const update = {
      contact_ids: [11],
      updates: { tags: ['vip'], tags_mode: 'add' as const },
      organization_id: 42,
    };

    await bulkUpdateContacts(update);
    await bulkDeleteContacts([11], 42);
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/contacts/bulk-update', update, {
      headers: { 'x-organization-id': '42' },
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/contacts/bulk-delete', {
      contact_ids: [11],
    }, { headers: { 'x-organization-id': '42' } });

    vi.clearAllMocks();
    vi.mocked(isContactGraphqlBulkMutationsEnabled).mockReturnValue(true);
    vi.mocked(bulkUpdateContactsViaGraphql).mockResolvedValue({
      updated_ids: [11], message: '1 contacts updated',
    });
    vi.mocked(bulkDeleteContactsViaGraphql).mockResolvedValue({
      deleted_ids: [11], message: '1 contacts deleted',
    });
    await bulkUpdateContacts(update);
    await bulkDeleteContacts([11], 42);
    expect(bulkUpdateContactsViaGraphql).toHaveBeenCalledWith(update);
    expect(bulkDeleteContactsViaGraphql).toHaveBeenCalledWith([11], 42);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps activity reads and writes on REST by default', async () => {
    const activity = {
      id: 91,
      contact_id: 11,
      type: 'note',
      content: { body: 'Call next week' },
      created_at: '2026-01-03T00:00:00.000Z',
    };
    vi.mocked(api.get).mockResolvedValue({ data: [activity] });
    vi.mocked(api.post).mockResolvedValue({ data: activity });
    const params = { type: 'note', limit: 25, offset: 25 };
    const input = { type: 'note', content: { body: 'Call next week' } };

    await expect(getContactActivities(11, params, 42)).resolves.toEqual([activity]);
    await expect(addContactActivity(11, input, 42)).resolves.toEqual(activity);

    expect(api.get).toHaveBeenCalledWith('/api/contacts/11/activities', {
      params,
      headers: { 'x-organization-id': '42' },
    });
    expect(api.post).toHaveBeenCalledWith('/api/contacts/11/activities', input, {
      headers: { 'x-organization-id': '42' },
    });
    expect(getContactActivitiesViaGraphql).not.toHaveBeenCalled();
    expect(addContactActivityViaGraphql).not.toHaveBeenCalled();
  });

  it('routes both activity operations through GraphQL only when their flag is enabled', async () => {
    vi.mocked(isContactGraphqlActivitiesEnabled).mockReturnValue(true);
    vi.mocked(getContactActivitiesViaGraphql).mockResolvedValue([]);
    vi.mocked(addContactActivityViaGraphql).mockResolvedValue({ id: 91 } as never);
    const params = { limit: 50 };
    const input = { type: 'note', content: { body: 'GraphQL' } };

    await getContactActivities(11, params, 42);
    await addContactActivity(11, input, 42);

    expect(getContactActivitiesViaGraphql).toHaveBeenCalledWith(11, params, 42);
    expect(addContactActivityViaGraphql).toHaveBeenCalledWith(11, input, 42);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
