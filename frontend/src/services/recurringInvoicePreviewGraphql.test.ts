import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRecurringInvoicePreviewBootstrapViaGraphql,
  resetRecurringInvoicePreviewCapability,
} from './recurringInvoicePreviewGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const recurringInvoice = {
  id: 8, organizationId: 4, templateName: 'Retainer', contactId: 9,
  customerName: 'Ada', customerEmail: 'ada@example.com', frequency: 'monthly',
  startDate: '2026-07-20', endDate: null, nextRunDate: '2026-08-20',
  lastGeneratedAt: null, status: 'active',
  items: [{ productId: null, name: 'Service', description: null, quantity: '1', unitPrice: '25', taxRate: '0' }],
  subtotal: '25.00', taxAmount: '0.00', discountAmount: '0.00',
  discountType: null, discountValue: '0.00', total: '25.00', currency: 'USD',
  notes: null, paymentTerms: null, customFields: {}, sourceInvoiceId: null,
  createdById: 7, createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z', contactFirstName: 'Ada',
  contactLastName: 'Lovelace', contactEmail: 'ada@example.com',
  sourceInvoiceNumber: null, invoicesGenerated: 0,
};

const business = {
  id: 3, organizationId: 4, name: 'Itemize', email: 'hello@itemize.test',
  phone: null, address: null, taxId: null, logoUrl: null, isActive: true,
  lastUsedAt: null, createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('recurring invoice preview GraphQL bootstrap', () => {
  beforeEach(() => {
    resetRecurringInvoicePreviewCapability();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps the expanded preview through one cancellable operation', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: {
      recurringInvoicePreviewBootstrap: {
        recurringInvoice,
        previewInvoiceNumber: 'INV-00042',
        business,
      },
    } }));
    const controller = new AbortController();

    await expect(getRecurringInvoicePreviewBootstrapViaGraphql(
      4,
      8,
      controller.signal,
    )).resolves.toMatchObject({
      recurringInvoice: { id: 8, total: 25 },
      previewInvoiceNumber: 'INV-00042',
      business: { id: 3, organization_id: 4 },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.query).toContain('query RecurringInvoicePreviewBootstrap(');
    expect(body.variables).toEqual({ recurringInvoiceId: 8 });
    expect(init?.signal).toBe(controller.signal);
  });

  it('remembers a legacy schema after the first missing-field negotiation', async () => {
    const detail = response({ data: { recurringInvoice } });
    const number = response({ data: { previewRecurringInvoiceNumber: 'INV-00042' } });
    const businesses = response({ data: { invoiceBusinesses: {
      nodes: [business],
      pageInfo: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    } } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ errors: [{
        message: 'Cannot query field "recurringInvoicePreviewBootstrap" on type "Query".',
      }] }))
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(number)
      .mockResolvedValueOnce(businesses)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(number)
      .mockResolvedValueOnce(businesses);

    await getRecurringInvoicePreviewBootstrapViaGraphql(4, 8);
    await getRecurringInvoicePreviewBootstrapViaGraphql(4, 8);

    const operations = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body));
      return String(body.query).match(/query\s+([A-Za-z0-9_]+)/)?.[1];
    });
    expect(operations.filter((operation) =>
      operation === 'RecurringInvoicePreviewBootstrap')).toHaveLength(1);
    expect(operations).toEqual([
      'RecurringInvoicePreviewBootstrap',
      'RecurringInvoice',
      'PreviewRecurringInvoiceNumber',
      'InvoiceBusinessPage',
      'RecurringInvoice',
      'PreviewRecurringInvoiceNumber',
      'InvoiceBusinessPage',
    ]);
  });
});
