import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getIntegrationOverviewViaGraphql,
  resetIntegrationOverviewCapability,
} from './integrationOverviewGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

const connection = {
  id: 4,
  provider: 'google',
  providerEmail: 'calendar@example.com',
  syncEnabled: true,
  syncDirection: 'both',
  lastSyncAt: null,
  isActive: true,
  errorMessage: null,
  errorCount: 0,
  selectedCalendars: ['primary'],
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const socialChannel = {
  id: 8,
  organizationId: 3,
  channelType: 'facebook',
  externalId: 'page-8',
  name: 'Itemize',
  username: null,
  profilePictureUrl: null,
  pageId: 'page-8',
  instagramBusinessAccountId: null,
  permissions: [],
  isActive: true,
  isConnected: true,
  connectionError: null,
  lastSyncedAt: null,
  webhookVerified: true,
  createdBy: 4,
  createdByName: 'QA',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const invoiceSettings = {
  id: null,
  organizationId: 3,
  stripeAccountId: 'acct_1',
  stripePublishableKey: null,
  stripeConnected: true,
  stripeConnectedAt: '2026-07-19T00:00:00.000Z',
  invoicePrefix: 'INV',
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

describe('integration overview GraphQL consumer', () => {
  beforeEach(() => {
    resetIntegrationOverviewCapability();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads the complete route status in one cancellable aggregate operation', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        integrationOverview: {
          calendarConnections: [connection],
          facebookChannel: { id: 8, name: 'Itemize' },
          facebookStatusAvailable: true,
          stripeConnected: true,
          stripeStatusAvailable: true,
        },
      },
    }));

    await expect(
      getIntegrationOverviewViaGraphql(3, controller.signal),
    ).resolves.toMatchObject({
      calendarConnections: [{ id: 4, provider_email: 'calendar@example.com' }],
      facebookChannel: { id: 8, name: 'Itemize' },
      facebookStatusAvailable: true,
      stripeConnected: true,
      stripeStatusAvailable: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.signal).toBe(controller.signal);
    expect(JSON.parse(String(request.body)).query).toContain(
      'query IntegrationOverview',
    );
  });

  it('negotiates the former separate reads once during a rolling deployment', async () => {
    const separateResponses = () => [
      response({ data: { calendarConnections: [connection] } }),
      response({ data: { socialChannels: [socialChannel] } }),
      response({ data: { invoiceSettings } }),
    ];
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        errors: [{ message: 'Cannot query field "integrationOverview" on type "Query".' }],
      }));
    for (const item of [...separateResponses(), ...separateResponses()]) {
      vi.mocked(fetch).mockResolvedValueOnce(item);
    }

    await expect(getIntegrationOverviewViaGraphql(3)).resolves.toMatchObject({
      facebookChannel: { id: 8, name: 'Itemize' },
      stripeConnected: true,
    });
    await getIntegrationOverviewViaGraphql(3);

    expect(fetch).toHaveBeenCalledTimes(7);
    const operations = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)).query as string,
    );
    expect(operations.filter((query) => query.includes('IntegrationOverview')))
      .toHaveLength(1);
  });
});
