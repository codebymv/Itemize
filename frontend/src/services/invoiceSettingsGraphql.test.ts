import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  getInvoiceSettingsViaGraphql,
  updateInvoiceSettingsViaGraphql,
} from './invoiceSettingsGraphql';
import {
  isInvoiceSettingsGraphqlMutationsEnabled,
  isInvoiceSettingsGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const settings = {
  id: 4,
  organizationId: 7,
  stripeAccountId: 'acct_123',
  stripePublishableKey: 'pk_test_123',
  stripeConnected: true,
  stripeConnectedAt: '2026-07-20T12:00:00.000Z',
  invoicePrefix: 'BILL-',
  nextInvoiceNumber: 42,
  defaultPaymentTerms: 14,
  defaultNotes: null,
  defaultTerms: 'Net 14',
  defaultTaxRate: '8.25',
  taxId: 'TAX-1',
  businessName: 'Itemize Studio',
  businessAddress: null,
  businessPhone: null,
  businessEmail: 'billing@example.com',
  logoUrl: '/uploads/logos/safe.png',
  defaultCurrency: 'USD',
  createdAt: '2026-07-19T12:00:00.000Z',
  updatedAt: '2026-07-20T12:00:00.000Z',
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('invoice settings GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('settings-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation flags independent and default-off', () => {
    vi.stubEnv('VITE_INVOICE_SETTINGS_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_INVOICE_SETTINGS_MUTATIONS_GRAPHQL', 'false');
    expect(isInvoiceSettingsGraphqlReadsEnabled()).toBe(false);
    expect(isInvoiceSettingsGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_INVOICE_SETTINGS_READS_GRAPHQL', 'true');
    expect(isInvoiceSettingsGraphqlReadsEnabled()).toBe(true);
    expect(isInvoiceSettingsGraphqlMutationsEnabled()).toBe(false);
  });

  it('maps settings reads into the retained snake-case shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { invoiceSettings: settings } }),
    );
    await expect(getInvoiceSettingsViaGraphql(7)).resolves.toMatchObject({
      id: 4,
      organization_id: 7,
      stripe_account_id: 'acct_123',
      stripe_publishable_key: 'pk_test_123',
      invoice_prefix: 'BILL-',
      next_invoice_number: 42,
      default_tax_rate: 8.25,
      business_email: 'billing@example.com',
      logo_url: '/uploads/logos/safe.png',
    });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });

  it('sends only writable settings and acquires CSRF', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { updateInvoiceSettings: settings } }),
    );
    await updateInvoiceSettingsViaGraphql({
      id: 4,
      organization_id: 7,
      stripe_account_id: 'acct_attacker',
      stripe_publishable_key: 'pk_attacker',
      stripe_connected: false,
      invoice_prefix: 'BILL-',
      next_invoice_number: 42,
      default_notes: '',
      default_tax_rate: 8.25,
      business_email: '',
      logo_url: 'https://attacker.invalid/logo.png',
      default_currency: 'USD',
    }, 7);
    const body = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body,
    ));
    expect(body.variables.input).toEqual({
      invoicePrefix: 'BILL-',
      nextInvoiceNumber: 42,
      defaultNotes: null,
      defaultTaxRate: '8.25',
      businessEmail: null,
      defaultCurrency: 'USD',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
  });
});
