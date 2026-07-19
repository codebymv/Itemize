import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createInvoiceBusinessViaGraphql,
  deleteInvoiceBusinessViaGraphql,
  getInvoiceBusinessesViaGraphql,
  getInvoiceBusinessViaGraphql,
  updateInvoiceBusinessViaGraphql,
} from './invoiceBusinessesGraphql';
import {
  isInvoiceBusinessGraphqlMutationsEnabled,
  isInvoiceBusinessGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const business = {
  id: 8,
  organizationId: 4,
  name: 'Itemize Studio',
  email: 'billing@itemize.test',
  phone: null,
  address: 'Phoenix, AZ',
  taxId: 'EIN-123',
  logoUrl: '/uploads/logos/safe.png',
  isActive: true,
  lastUsedAt: '2026-07-18T12:00:00.000Z',
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('invoice business GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('business-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollback flags independent and default-off', () => {
    vi.stubEnv('VITE_INVOICE_BUSINESS_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_INVOICE_BUSINESS_MUTATIONS_GRAPHQL', 'false');
    expect(isInvoiceBusinessGraphqlReadsEnabled()).toBe(false);
    expect(isInvoiceBusinessGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_INVOICE_BUSINESS_READS_GRAPHQL', 'true');
    expect(isInvoiceBusinessGraphqlReadsEnabled()).toBe(true);
    expect(isInvoiceBusinessGraphqlMutationsEnabled()).toBe(false);
  });

  it('pages list reads and maps detail casing into the retained shape', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            invoiceBusinesses: {
              nodes: [business],
              pageInfo: { hasNextPage: true },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            invoiceBusinesses: {
              nodes: [{ ...business, id: 9, name: 'Second' }],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { invoiceBusiness: business } }),
      );
    const businesses = await getInvoiceBusinessesViaGraphql(4);
    expect(businesses).toHaveLength(2);
    expect(businesses[0]).toMatchObject({
      id: 8,
      organization_id: 4,
      tax_id: 'EIN-123',
      logo_url: '/uploads/logos/safe.png',
      is_active: true,
      last_used_at: business.lastUsedAt,
    });
    await expect(getInvoiceBusinessViaGraphql(8, 4)).resolves.toMatchObject({
      id: 8,
      name: 'Itemize Studio',
    });
    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies.slice(0, 2).map((body) => body.variables.page.page))
      .toEqual([1, 2]);
    expect(bodies[2].variables).toEqual({ id: 8 });
  });

  it('maps writable fields, excludes logo ownership, and verifies delete', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { createInvoiceBusiness: business } }),
      )
      .mockResolvedValueOnce(
        response({ data: { updateInvoiceBusiness: business } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            deleteInvoiceBusiness: { deletedId: 8, success: true },
          },
        }),
      );
    await createInvoiceBusinessViaGraphql({
      name: 'Itemize Studio',
      email: '',
      logo_url: 'https://attacker.invalid/logo.png',
    });
    await updateInvoiceBusinessViaGraphql(8, {
      phone: '',
      address: 'Phoenix, AZ',
      logo_url: 'https://attacker.invalid/replacement.png',
    });
    await expect(deleteInvoiceBusinessViaGraphql(8)).resolves.toEqual({
      success: true,
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toEqual({
      name: 'Itemize Studio',
      email: null,
    });
    expect(bodies[1].variables).toEqual({
      id: 8,
      input: { phone: null, address: 'Phoenix, AZ' },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });
});
