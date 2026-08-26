import { fetchCsrfToken } from '@/lib/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectStripeViaGraphql,
  startStripeConnectViaGraphql,
} from './stripeConnectGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const response = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('stripe connect GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('stripe-connect-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('starts hosted onboarding through a CSRF-protected tenant-scoped mutation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          startStripeConnect: 'https://connect.stripe.com/setup/s/example',
        },
      }),
    );

    await expect(
      startStripeConnectViaGraphql(7, '/payment-settings'),
    ).resolves.toEqual({
      authUrl: 'https://connect.stripe.com/setup/s/example',
    });

    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-csrf-token': 'stripe-connect-csrf',
      'x-organization-id': '7',
    });
    const body = JSON.parse(String(request.body));
    expect(body.query).toContain('mutation StartStripeConnect');
    expect(body.variables).toEqual({ returnUrl: '/payment-settings' });
  });

  it('disconnects through a CSRF-protected tenant-scoped mutation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { disconnectStripe: true } }),
    );

    await expect(disconnectStripeViaGraphql(7)).resolves.toEqual({
      success: true,
    });

    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-csrf-token': 'stripe-connect-csrf',
      'x-organization-id': '7',
    });
    const body = JSON.parse(String(request.body));
    expect(body.query).toContain('mutation DisconnectStripe');
    expect(body.query).toContain('disconnectStripe');
  });
});
