import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createInvoiceBusinessViaGraphql,
  deleteInvoiceBusinessViaGraphql,
  getInvoiceBusinessPageViaGraphql,
  getInvoiceBusinessesViaGraphql,
  getInvoiceBusinessViaGraphql,
  removeInvoiceBusinessLogoViaGraphql,
  updateInvoiceBusinessViaGraphql,
} from './invoiceBusinessesGraphql';

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
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('business-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('pages list reads and maps detail casing into the retained shape', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            invoiceBusinesses: {
              nodes: [business],
              pageInfo: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            invoiceBusinesses: {
              nodes: [{ ...business, id: 9, name: 'Second' }],
              pageInfo: { page: 2, pageSize: 100, total: 101, totalPages: 2 },
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

  it('supports one bounded management page with cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: {
      invoiceBusinesses: {
        nodes: [business],
        pageInfo: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      },
    } }));
    await expect(getInvoiceBusinessPageViaGraphql(2, 20, 4, controller.signal)).resolves.toMatchObject({
      businesses: [{ id: 8, name: 'Itemize Studio' }],
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
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
    }, 'business-create-key');
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
    expect(bodies[0].variables.idempotencyKey).toBe('business-create-key');
    expect(bodies[1].variables).toEqual({
      id: 8,
      input: { phone: null, address: 'Phoenix, AZ' },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });

  it('removes a logo through a CSRF-protected mutation', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        removeInvoiceBusinessLogo: { success: true, cleanupQueued: true },
      },
    }));
    await expect(removeInvoiceBusinessLogoViaGraphql(8, 4)).resolves.toEqual({
      success: true,
    });
    const body = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body,
    ));
    expect(body.query).toContain('mutation RemoveInvoiceBusinessLogo');
    expect(body.variables).toEqual({ id: 8 });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
  });
});
