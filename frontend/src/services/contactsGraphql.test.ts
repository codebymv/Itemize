import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContactViaGraphql, getContactsViaGraphql } from './contactsGraphql';
import { GraphqlRequestError, isContactGraphqlReadsEnabled } from './graphqlClient';

const graphqlContact = {
  id: 11,
  organizationId: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  company: 'Analytical Engines',
  jobTitle: null,
  address: { city: 'London' },
  source: 'MANUAL',
  status: 'ACTIVE',
  customFields: { preferred: true },
  tags: ['vip'],
  assignedToId: 7,
  assignedToName: 'Owner',
  createdById: 7,
  createdByName: 'Owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

describe('contact GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the GraphQL contact-read feature disabled by default', () => {
    vi.stubEnv('VITE_CONTACT_READS_GRAPHQL', 'false');
    expect(isContactGraphqlReadsEnabled()).toBe(false);
    vi.stubEnv('VITE_CONTACT_READS_GRAPHQL', 'true');
    expect(isContactGraphqlReadsEnabled()).toBe(true);
  });

  it('maps list inputs and the GraphQL page into the existing REST-shaped contract', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        contacts: {
          nodes: [graphqlContact],
          pageInfo: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
        },
      },
    }));

    const result = await getContactsViaGraphql({
      search: 'Ada',
      status: 'active',
      tags: ['vip'],
      assigned_to: 7,
      sort_by: 'first_name',
      sort_order: 'asc',
      page: 2,
      limit: 25,
      organization_id: 42,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.variables).toEqual({
      filter: {
        search: 'Ada',
        status: 'ACTIVE',
        tags: ['vip'],
        assignedToId: 7,
      },
      page: { page: 2, pageSize: 25 },
      sort: { field: 'FIRST_NAME', direction: 'ASC' },
    });
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ 'x-organization-id': '42' });
    expect(result).toEqual({
      contacts: [expect.objectContaining({
        id: 11,
        organization_id: 42,
        first_name: 'Ada',
        status: 'active',
        custom_fields: { preferred: true },
      })],
      pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });
  });

  it('maps detail reads without exposing GraphQL casing to existing consumers', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { contact: graphqlContact } }));

    await expect(getContactViaGraphql(11, 42)).resolves.toMatchObject({
      id: 11,
      organization_id: 42,
      source: 'manual',
      status: 'active',
      assigned_to: 7,
      created_by: 7,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body)).variables).toEqual({ id: 11 });
  });

  it('surfaces GraphQL error codes instead of silently falling back to REST', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: { contact: null },
      errors: [{ message: 'Contact not found', extensions: { code: 'NOT_FOUND' } }],
    }));

    try {
      await getContactViaGraphql(999, 42);
      throw new Error('Expected GraphQL request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphqlRequestError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', status: 200 });
    }
  });

  it('fails closed when a nullable detail response has no contact', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { contact: null } }));

    await expect(getContactViaGraphql(999, 42)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 200,
    });
  });
});
