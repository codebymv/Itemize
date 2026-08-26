import { readIntegrationOAuthResult, integrationOAuthToast } from './integrationOAuthReturn';

describe('readIntegrationOAuthResult', () => {
  it('reads a Google Calendar success return', () => {
    expect(readIntegrationOAuthResult('?google_connected=true')).toEqual({
      ok: true,
      provider: 'google',
    });
  });

  it('reads a Facebook success return', () => {
    expect(readIntegrationOAuthResult('success=facebook_connected')).toEqual({
      ok: true,
      provider: 'facebook',
    });
  });

  it('reads a Stripe success return', () => {
    expect(readIntegrationOAuthResult('?stripe_connected=true')).toEqual({
      ok: true,
      provider: 'stripe',
    });
  });

  it('reads a pending Stripe onboarding return', () => {
    const result = readIntegrationOAuthResult('?stripe_onboarding=pending');
    expect(result).toEqual({
      ok: true,
      provider: 'stripe',
      pending: true,
    });
    expect(integrationOAuthToast(result!)).toMatchObject({
      title: 'Stripe setup submitted',
    });
  });

  it('reads an OAuth error return', () => {
    expect(readIntegrationOAuthResult('?error=invalid_state')).toEqual({
      ok: false,
      error: 'invalid_state',
    });
  });

  it('returns null when the URL has no integration result', () => {
    expect(readIntegrationOAuthResult('')).toBeNull();
  });
});

describe('integrationOAuthToast', () => {
  it('humanizes error codes for the toast', () => {
    expect(integrationOAuthToast({ ok: false, error: 'token_exchange_failed' })).toMatchObject({
      title: 'Connection failed',
      description: 'token exchange failed',
      variant: 'destructive',
    });
  });
});
