import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEstimateEditorBootstrapViaGraphql,
  getInvoiceEditorBootstrapViaGraphql,
  resetSalesDocumentEditorCapabilities,
} from './salesDocumentEditorGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const contact = {
  id: 11,
  organizationId: 42,
  firstName: 'Maya',
  lastName: 'Patel',
  email: 'maya@example.com',
  phone: null,
  company: null,
  jobTitle: null,
  address: {},
  source: 'MANUAL',
  status: 'ACTIVE',
  customFields: {},
  tags: [],
  assignedToId: null,
  assignedToName: null,
  createdById: null,
  createdByName: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const product = {
  id: 21,
  organizationId: 42,
  name: 'Workshop',
  description: null,
  sku: null,
  price: '125.00',
  currency: 'USD',
  productType: 'one_time',
  billingPeriod: null,
  taxRate: '0',
  taxable: true,
  isActive: true,
  createdById: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const business = {
  id: 31,
  organizationId: 42,
  name: 'Itemize QA',
  email: null,
  phone: null,
  address: null,
  taxId: null,
  logoUrl: null,
  isActive: true,
  lastUsedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const settings = {
  id: null,
  organizationId: 42,
  stripeAccountId: null,
  stripePublishableKey: null,
  stripeConnected: false,
  stripeConnectedAt: null,
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  defaultPaymentTerms: 30,
  defaultNotes: null,
  defaultTerms: null,
  defaultTaxRate: '0',
  taxId: null,
  businessName: null,
  businessAddress: null,
  businessPhone: null,
  businessEmail: null,
  logoUrl: null,
  defaultCurrency: 'USD',
  createdAt: null,
  updatedAt: null,
};

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

const bodyAt = (index: number) => JSON.parse(String(
  (vi.mocked(fetch).mock.calls[index][1] as RequestInit).body,
));

describe('sales document editor GraphQL bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSalesDocumentEditorCapabilities();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads a new invoice editor in one aggregate request', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        invoiceEditorBootstrap: {
          contacts: [contact],
          products: [product],
          businesses: [business],
          settings,
          invoice: null,
        },
      },
    }));

    await expect(getInvoiceEditorBootstrapViaGraphql(42, null)).resolves.toEqual({
      contacts: [expect.objectContaining({ id: 11, first_name: 'Maya' })],
      products: [expect.objectContaining({ id: 21, price: 125 })],
      businesses: [expect.objectContaining({ id: 31, name: 'Itemize QA' })],
      settings: expect.objectContaining({ default_payment_terms: 30 }),
      invoice: null,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyAt(0).query).toContain('query InvoiceEditorBootstrap');
    expect(bodyAt(0).variables).toEqual({ invoiceId: null });
  });

  it('includes an unlisted URL contact in the estimate bootstrap', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        estimateEditorBootstrap: {
          contacts: [],
          products: [product],
          estimate: null,
          initialContact: contact,
        },
      },
    }));

    const result = await getEstimateEditorBootstrapViaGraphql(42, null, 11);

    expect(result.initialContact).toEqual(expect.objectContaining({
      id: 11,
      email: 'maya@example.com',
    }));
    expect(bodyAt(0).variables).toEqual({
      estimateId: null,
      initialContactId: 11,
    });
  });

  it('remembers an older schema instead of probing on every invoice load', async () => {
    const missingField = response({
      errors: [{
        message: 'Cannot query field "invoiceEditorBootstrap" on type "Query".',
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      }],
    }, 400);
    const contacts = response({
      data: {
        contacts: {
          nodes: [contact],
          pageInfo: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        },
      },
    });
    const products = response({
      data: { products: { nodes: [product], pageInfo: { hasNextPage: false } } },
    });
    const businesses = response({
      data: {
        invoiceBusinesses: {
          nodes: [business],
          pageInfo: { hasNextPage: false },
        },
      },
    });
    const invoiceSettings = response({ data: { invoiceSettings: settings } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(missingField)
      .mockResolvedValueOnce(contacts)
      .mockResolvedValueOnce(products)
      .mockResolvedValueOnce(businesses)
      .mockResolvedValueOnce(invoiceSettings)
      .mockResolvedValueOnce(contacts)
      .mockResolvedValueOnce(products)
      .mockResolvedValueOnce(businesses)
      .mockResolvedValueOnce(invoiceSettings);

    await getInvoiceEditorBootstrapViaGraphql(42, null);
    await getInvoiceEditorBootstrapViaGraphql(42, null);

    expect(fetch).toHaveBeenCalledTimes(9);
    expect(bodyAt(5).query).toContain('query ContactReads');
    expect(bodyAt(5).query).not.toContain('invoiceEditorBootstrap');
  });
});
