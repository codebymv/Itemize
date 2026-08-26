import { Logger } from '@nestjs/common';

export const STRIPE_CONNECT_CLIENT = Symbol('STRIPE_CONNECT_CLIENT');

export const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

const FALLBACK_PRODUCTION_API_ORIGIN = 'https://api.itemize.cloud';
const RAILWAY_DOMAIN = /^[a-z0-9.-]+$/i;

export type StripeConnectedAccount = {
  stripeAccountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

export interface StripeConnectClient {
  createAccount(organizationId: number): Promise<StripeConnectedAccount>;
  retrieveAccount(stripeAccountId: string): Promise<StripeConnectedAccount | null>;
  createOnboardingLink(
    stripeAccountId: string,
    state: string,
  ): Promise<string>;
}

const getProductionApiOrigin = (): string => {
  const configured = process.env.STRIPE_CONNECT_API_ORIGIN?.trim();
  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new Error('STRIPE_CONNECT_API_ORIGIN must be an absolute HTTP(S) URL');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
    ) {
      throw new Error(
        'STRIPE_CONNECT_API_ORIGIN must be a credential-free HTTPS URL in production',
      );
    }
    return parsed.origin;
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain && RAILWAY_DOMAIN.test(railwayDomain)) {
    return `https://${railwayDomain}`;
  }
  return process.env.NODE_ENV === 'production'
    ? FALLBACK_PRODUCTION_API_ORIGIN
    : 'http://localhost:3001';
};

const stripeSecret = (): string => {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error('Stripe Connect is not configured');
  return secret;
};

type StripeResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

export class HttpStripeConnectClient implements StripeConnectClient {
  private readonly logger = new Logger(HttpStripeConnectClient.name);

  async createAccount(organizationId: number): Promise<StripeConnectedAccount> {
    const form = new URLSearchParams({
      'controller[losses][payments]': 'stripe',
      'controller[fees][payer]': 'account',
      'controller[requirement_collection]': 'stripe',
      'controller[stripe_dashboard][type]': 'full',
      'metadata[itemize_organization_id]': String(organizationId),
    });
    const response = await this.request(
      '/v1/accounts',
      'POST',
      form,
      `itemize-connect-account-${organizationId}`,
    );
    if (!response.ok) this.failure('account creation', response);
    return this.account(response.body);
  }

  async retrieveAccount(
    stripeAccountId: string,
  ): Promise<StripeConnectedAccount | null> {
    if (!STRIPE_ACCOUNT_ID.test(stripeAccountId)) return null;
    const response = await this.request(
      `/v1/accounts/${encodeURIComponent(stripeAccountId)}`,
      'GET',
    );
    if (response.status === 404) return null;
    if (!response.ok) this.failure('account retrieval', response);
    return this.account(response.body);
  }

  async createOnboardingLink(
    stripeAccountId: string,
    state: string,
  ): Promise<string> {
    if (!STRIPE_ACCOUNT_ID.test(stripeAccountId)) {
      throw new Error('Stripe connected account is invalid');
    }
    const origin = getProductionApiOrigin();
    const encodedState = encodeURIComponent(state);
    const form = new URLSearchParams({
      account: stripeAccountId,
      refresh_url: `${origin}/api/invoice-integrations/stripe/refresh?state=${encodedState}`,
      return_url: `${origin}/api/invoice-integrations/stripe/return?state=${encodedState}`,
      type: 'account_onboarding',
      'collection_options[fields]': 'eventually_due',
    });
    const response = await this.request('/v1/account_links', 'POST', form);
    const url = typeof response.body.url === 'string' ? response.body.url : '';
    if (!response.ok || !url.startsWith('https://')) {
      this.failure('onboarding link creation', response);
    }
    return url;
  }

  private account(body: Record<string, unknown>): StripeConnectedAccount {
    const stripeAccountId = String(body.id || '').trim();
    if (!STRIPE_ACCOUNT_ID.test(stripeAccountId)) {
      throw new Error('Stripe returned an invalid connected account');
    }
    return {
      stripeAccountId,
      chargesEnabled: body.charges_enabled === true,
      detailsSubmitted: body.details_submitted === true,
    };
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    form?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<StripeResponse> {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripeSecret()}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(form ? { body: form.toString() } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  private failure(operation: string, response: StripeResponse): never {
    const stripeError = response.body.error;
    const message =
      stripeError && typeof stripeError === 'object'
        ? String((stripeError as Record<string, unknown>).message || '')
        : '';
    this.logger.error(
      `Stripe Connect ${operation} failed: ${response.status}${message ? `: ${message}` : ''}`,
    );
    throw new Error(`Stripe Connect ${operation} failed`);
  }
}
