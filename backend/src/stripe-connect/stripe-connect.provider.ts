/**
 * Faithful port of the retained Stripe Connect client
 * (backend/src/services/stripeConnectService.js).
 */
import { Logger } from '@nestjs/common';

export const STRIPE_CONNECT_CLIENT = Symbol('STRIPE_CONNECT_CLIENT');

export const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

const FALLBACK_PRODUCTION_API_ORIGIN =
  'https://api.itemize.cloud';
const RAILWAY_DOMAIN = /^[a-z0-9.-]+$/i;

export type StripeConnectedAccount = {
  stripeAccountId: string;
  stripePublishableKey: string | null;
};

export interface StripeConnectClient {
  getAuthUrl(state: string): string;
  exchangeCodeForAccount(code: string): Promise<StripeConnectedAccount>;
  deauthorizeAccount(stripeAccountId: string | null): Promise<void>;
}

const getProductionApiOrigin = (): string => {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain && RAILWAY_DOMAIN.test(railwayDomain)) {
    return `https://${railwayDomain}`;
  }
  return FALLBACK_PRODUCTION_API_ORIGIN;
};

const getConnectRedirectUri = (): string => {
  const configured = process.env.STRIPE_CONNECT_REDIRECT_URI?.trim();
  if (!configured) {
    return process.env.NODE_ENV === 'production'
      ? `${getProductionApiOrigin()}/api/invoice-integrations/stripe/callback`
      : 'http://localhost:3001/api/invoice-integrations/stripe/callback';
  }
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('STRIPE_CONNECT_REDIRECT_URI must be an absolute HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
  ) {
    throw new Error(
      'STRIPE_CONNECT_REDIRECT_URI must be a credential-free HTTPS URL in production',
    );
  }
  return configured;
};

const assertConnectConfigured = (): void => {
  if (
    !process.env.STRIPE_CLIENT_ID?.trim() ||
    !process.env.STRIPE_SECRET_KEY?.trim()
  ) {
    throw new Error('Stripe Connect is not configured');
  }
};

export class HttpStripeConnectClient implements StripeConnectClient {
  private readonly logger = new Logger(HttpStripeConnectClient.name);

  getAuthUrl(state: string): string {
    assertConnectConfigured();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: (process.env.STRIPE_CLIENT_ID as string).trim(),
      scope: 'read_write',
      state,
      redirect_uri: getConnectRedirectUri(),
    });
    return `https://connect.stripe.com/oauth/authorize?${params}`;
  }

  async exchangeCodeForAccount(code: string): Promise<StripeConnectedAccount> {
    assertConnectConfigured();
    const form = new URLSearchParams({
      client_secret: (process.env.STRIPE_SECRET_KEY as string).trim(),
      code: String(code),
      grant_type: 'authorization_code',
    });
    const response = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      stripe_user_id?: unknown;
      stripe_publishable_key?: unknown;
      error?: unknown;
      error_description?: unknown;
    };
    const accountId = String(body.stripe_user_id || '').trim();
    if (!response.ok || body.error || !STRIPE_ACCOUNT_ID.test(accountId)) {
      this.logger.error(
        `Stripe Connect token exchange failed: ${response.status}: ${
          body.error || body.error_description || 'invalid_account'
        }`,
      );
      throw new Error('Stripe Connect token exchange failed');
    }
    return {
      stripeAccountId: accountId,
      stripePublishableKey:
        typeof body.stripe_publishable_key === 'string'
          ? body.stripe_publishable_key
          : null,
    };
  }

  async deauthorizeAccount(stripeAccountId: string | null): Promise<void> {
    if (!STRIPE_ACCOUNT_ID.test(String(stripeAccountId || ''))) return;
    if (
      !process.env.STRIPE_CLIENT_ID?.trim() ||
      !process.env.STRIPE_SECRET_KEY?.trim()
    ) {
      return;
    }
    const form = new URLSearchParams({
      client_id: process.env.STRIPE_CLIENT_ID.trim(),
      stripe_user_id: stripeAccountId as string,
    });
    const response = await fetch(
      'https://connect.stripe.com/oauth/deauthorize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY.trim()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        error_description?: unknown;
      };
      const message = String(body.error_description || body.error || '');
      if (!/already been deauthorized|no such/i.test(message)) {
        this.logger.warn(
          `Stripe Connect deauthorize did not succeed: ${response.status}`,
        );
      }
    }
  }
}
