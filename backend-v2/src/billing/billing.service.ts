import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  BILLING_PLANS,
  BillingPeriod,
  BillingPlanId,
  billingPrices,
  planDefinition,
  planForPrice,
} from './billing.constants';
import { CreateBillingCheckoutInput } from './billing.inputs';
import { BillingRepository, BillingStatusRow } from './billing.repository';
import { StripeBillingProvider } from './stripe-billing.provider';
import {
  BillingPlan,
  BillingSession,
  BillingStatus,
  BillingUsage,
  BillingUsageMeter,
} from './billing.types';

@Injectable()
export class BillingService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly stripe: StripeBillingProvider,
  ) {}

  plans(): BillingPlan[] {
    return BILLING_PLANS.map((plan) => ({
      ...plan,
      pricing: { ...plan.pricing },
      limits: { ...plan.limits },
    }));
  }

  async status(organizationId: number): Promise<BillingStatus> {
    let row = await this.billing.status(organizationId);
    if (!row) throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    if (this.isLocallyStale(row) && this.stripe.isConfigured()) {
      try {
        const subscription = await this.stripe.activeSubscription(
          row.stripe_customer_id as string,
        );
        const mapped =
          subscription?.priceId && planForPrice(subscription.priceId);
        const definition = mapped && planDefinition(mapped.planId);
        if (subscription && mapped && definition) {
          await this.billing.synchronizeSubscription(
            organizationId,
            subscription,
            mapped.planId,
            mapped.period,
            definition.limits,
          );
          row = (await this.billing.status(organizationId)) ?? row;
        }
      } catch {
        // The signed webhook remains authoritative. A read-time provider failure
        // must not make locally persisted billing state unavailable.
      }
    }
    return this.mapStatus(row);
  }

  async usage(organizationId: number): Promise<BillingUsage> {
    const row = await this.billing.usage(organizationId);
    if (!row) throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    return {
      period: {
        start: row.billing_period_start,
        end: row.billing_period_end,
      },
      usage: {
        emails: this.meter(row.emails_used, row.emails_limit),
        sms: this.meter(row.sms_used, row.sms_limit),
        apiCalls: this.meter(row.api_calls_used, row.api_calls_limit),
      },
      resources: {
        contacts: Number(row.contacts),
        workflows: Number(row.workflows),
        forms: Number(row.forms),
        landingPages: Number(row.landing_pages),
      },
    };
  }

  async checkout(
    organizationId: number,
    input: CreateBillingCheckoutInput,
  ): Promise<BillingSession> {
    if (input.mode && input.mode !== 'subscription') {
      throw itemizeGraphqlError(
        'Only subscription checkout is supported',
        'BAD_USER_INPUT',
        { field: 'mode', reason: 'UNSUPPORTED_CHECKOUT_MODE' },
      );
    }
    const successUrl = this.redirectUrl(input.successUrl, 'successUrl');
    const cancelUrl = this.redirectUrl(input.cancelUrl, 'cancelUrl');
    const idempotencyKey = this.idempotencyKey(input.idempotencyKey);
    const resolved = this.checkoutPrice(input);
    this.requireStripe();

    const customer = await this.billing.ensureCustomer(
      organizationId,
      (name) =>
        this.stripe.createCustomer({
          name,
          email: `org-${organizationId}@itemize.cloud`,
          organizationId,
        }),
    );
    try {
      if (customer.existed) {
        const active = await this.stripe.activeSubscription(customer.customerId);
        if (active) {
          return {
            url: await this.stripe.createPortalSession(
              customer.customerId,
              successUrl,
              `billing-portal:${organizationId}:${idempotencyKey}`,
            ),
          };
        }
      }
      return {
        url: await this.stripe.createCheckoutSession({
          customerId: customer.customerId,
          priceId: resolved.priceId,
          organizationId,
          successUrl,
          cancelUrl,
          idempotencyKey,
        }),
      };
    } catch {
      throw itemizeGraphqlError(
        'Billing provider request failed',
        'SERVICE_UNAVAILABLE',
        { reason: 'BILLING_PROVIDER_FAILURE' },
      );
    }
  }

  async portal(
    organizationId: number,
    returnUrlValue: string,
    idempotencyKeyValue: string,
  ): Promise<BillingSession> {
    const returnUrl = this.redirectUrl(returnUrlValue, 'returnUrl');
    const idempotencyKey = this.idempotencyKey(idempotencyKeyValue);
    this.requireStripe();
    const customerId = await this.billing.portalCustomer(organizationId);
    if (!customerId) {
      throw itemizeGraphqlError(
        'No billing account found. Please subscribe first.',
        'BAD_USER_INPUT',
        { reason: 'BILLING_ACCOUNT_REQUIRED' },
      );
    }
    try {
      return {
        url: await this.stripe.createPortalSession(
          customerId,
          returnUrl,
          `billing-portal:${organizationId}:${idempotencyKey}`,
        ),
      };
    } catch {
      throw itemizeGraphqlError(
        'Billing provider request failed',
        'SERVICE_UNAVAILABLE',
        { reason: 'BILLING_PROVIDER_FAILURE' },
      );
    }
  }

  async acknowledgeTrialEnd(
    organizationId: number,
  ): Promise<{ acknowledged: boolean }> {
    if (!(await this.billing.acknowledgeTrialEnd(organizationId))) {
      throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    }
    return { acknowledged: true };
  }

  private checkoutPrice(input: CreateBillingCheckoutInput): {
    planId: BillingPlanId;
    period: BillingPeriod;
    priceId: string;
  } {
    const period = input.billingPeriod ?? 'monthly';
    if (period !== 'monthly' && period !== 'yearly') {
      throw itemizeGraphqlError('Invalid billing period', 'BAD_USER_INPUT', {
        field: 'billingPeriod',
        reason: 'INVALID_BILLING_PERIOD',
      });
    }
    if (input.priceId) {
      const mapped = planForPrice(input.priceId);
      if (!mapped || (input.planId && input.planId !== mapped.planId)) {
        throw itemizeGraphqlError('Invalid plan or price ID', 'BAD_USER_INPUT', {
          field: 'priceId',
          reason: 'INVALID_BILLING_PRICE',
        });
      }
      return { ...mapped, priceId: input.priceId };
    }
    const definition = input.planId && planDefinition(input.planId);
    if (!definition) {
      throw itemizeGraphqlError('Invalid plan or price ID', 'BAD_USER_INPUT', {
        field: 'planId',
        reason: 'INVALID_BILLING_PLAN',
      });
    }
    return {
      planId: definition.id,
      period,
      priceId: billingPrices()[definition.id][period],
    };
  }

  private redirectUrl(value: string, field: string): string {
    if (typeof value !== 'string' || value.length > 2048) {
      throw itemizeGraphqlError(`Invalid ${field}`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_REDIRECT_URL',
      });
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw itemizeGraphqlError(`Invalid ${field}`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_REDIRECT_URL',
      });
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw itemizeGraphqlError(`Invalid ${field}`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_REDIRECT_URL',
      });
    }
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.APP_URL,
      ...(process.env.CORS_ORIGIN?.split(',') ?? []),
      ...(process.env.EXTRA_CORS_ORIGINS?.split(',') ?? []),
    ]
      .filter((candidate): candidate is string => Boolean(candidate?.trim()))
      .flatMap((candidate) => {
        try {
          return [new URL(candidate.trim()).origin];
        } catch {
          return [];
        }
      });
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
      throw itemizeGraphqlError(`Invalid ${field}`, 'BAD_USER_INPUT', {
        field,
        reason: 'REDIRECT_ORIGIN_NOT_ALLOWED',
      });
    }
    return url.toString();
  }

  private requireStripe(): void {
    if (!this.stripe.isConfigured()) {
      throw itemizeGraphqlError(
        'Billing is temporarily unavailable',
        'SERVICE_UNAVAILABLE',
        { reason: 'BILLING_NOT_CONFIGURED' },
      );
    }
  }

  private idempotencyKey(value: string): string {
    if (
      typeof value !== 'string' ||
      value.length < 16 ||
      value.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
      throw itemizeGraphqlError(
        'Invalid billing idempotency key',
        'BAD_USER_INPUT',
        { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
      );
    }
    return value;
  }

  private isLocallyStale(row: BillingStatusRow): boolean {
    return Boolean(
      row.stripe_customer_id &&
        (!row.subscription_status || row.subscription_status === 'none') &&
        (!row.trial_ends_at || row.trial_ends_at.getTime() < Date.now()),
    );
  }

  private meter(usedValue: number | null, limitValue: number | null): BillingUsageMeter {
    const used = Number(usedValue ?? 0);
    const limit = Number(limitValue ?? 0);
    return {
      used,
      limit,
      percentage:
        limit <= 0 ? 0 : Math.round((Math.max(0, used) / limit) * 100),
    };
  }

  private mapStatus(row: BillingStatusRow): BillingStatus {
    return {
      plan: row.plan ?? 'starter',
      subscriptionStatus: row.subscription_status ?? 'none',
      billingPeriod: row.billing_period ?? 'monthly',
      billingPeriodStart: row.billing_period_start,
      billingPeriodEnd: row.billing_period_end,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      emailsUsed: Number(row.emails_used ?? 0),
      emailsLimit: Number(row.emails_limit ?? 0),
      smsUsed: Number(row.sms_used ?? 0),
      smsLimit: Number(row.sms_limit ?? 0),
      apiCallsUsed: Number(row.api_calls_used ?? 0),
      apiCallsLimit: Number(row.api_calls_limit ?? 0),
      contactsLimit: Number(row.contacts_limit ?? 0),
      usersLimit: Number(row.users_limit ?? 0),
      workflowsLimit: Number(row.workflows_limit ?? 0),
      landingPagesLimit: Number(row.landing_pages_limit ?? 0),
      formsLimit: Number(row.forms_limit ?? 0),
      calendarsLimit: Number(row.calendars_limit ?? 0),
      trialEndsAt: row.trial_ends_at,
      trialEndAcknowledgedAt: row.trial_end_acknowledged_at,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      canceledAt: row.canceled_at,
    };
  }
}
