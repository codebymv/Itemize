import { Injectable, Logger } from '@nestjs/common';
import { ActivationService } from '../activation/activation.service';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  BILLING_PLANS,
  BillingPeriod,
  BillingPlanId,
  billingPrices,
  isPurchasableStripePriceId,
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
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly billing: BillingRepository,
    private readonly stripe: StripeBillingProvider,
    private readonly activation: ActivationService,
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
    this.requireSubscriptionBillingIsolation();
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
    this.requirePurchasablePrice(resolved);
    this.requireStripe();

    const customer = await this.billing.ensureCustomer(
      organizationId,
      (name, ownerEmail) =>
        this.stripe.createCustomer({
          name,
          email: ownerEmail,
          organizationId,
        }),
    );
    let providerResult: {
      session: BillingSession;
      checkoutCreated: boolean;
    };
    try {
      providerResult = await this.startProviderCheckout(
        organizationId,
        customer,
        resolved.priceId,
        successUrl,
        cancelUrl,
        idempotencyKey,
      );
    } catch (error) {
      if (!this.isMissingStripeCustomer(error)) {
        throw this.providerFailure(error);
      }
      try {
        const replacement = await this.replaceMissingCustomer(organizationId);
        providerResult = await this.startProviderCheckout(
          organizationId,
          replacement,
          resolved.priceId,
          successUrl,
          cancelUrl,
          idempotencyKey,
        );
      } catch (retryError) {
        throw this.providerFailure(retryError);
      }
    }
    if (providerResult.checkoutCreated) {
      await this.activation.recordCheckoutStarted({
        organizationId,
        plan: resolved.planId,
        billingPeriod: resolved.period,
      });
    }
    return providerResult.session;
  }

  async portal(
    organizationId: number,
    returnUrlValue: string,
    idempotencyKeyValue: string,
  ): Promise<BillingSession> {
    this.requireSubscriptionBillingIsolation();
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
    } catch (error) {
      throw this.providerFailure(error);
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

  async startSoloTrial(organizationId: number): Promise<BillingStatus> {
    const current = await this.billing.status(organizationId);
    if (!current) throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    if (
      current.plan !== 'free' ||
      current.subscription_status !== 'none' ||
      current.trial_started_at ||
      current.stripe_subscription_id
    ) {
      throw itemizeGraphqlError(
        'This workspace is not eligible for another free trial',
        'BAD_USER_INPUT',
        { reason: 'TRIAL_NOT_AVAILABLE' },
      );
    }
    const definition = planDefinition('starter');
    if (!definition) throw new Error('Solo plan definition is unavailable');
    const updated = await this.billing.startSoloTrial(
      organizationId,
      definition.limits,
    );
    if (!updated) {
      throw itemizeGraphqlError(
        'This workspace is not eligible for another free trial',
        'BAD_USER_INPUT',
        { reason: 'TRIAL_NOT_AVAILABLE' },
      );
    }
    return this.mapStatus(updated);
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

  private requirePurchasablePrice(resolved: {
    planId: BillingPlanId;
    period: BillingPeriod;
    priceId: string;
  }): void {
    if (isPurchasableStripePriceId(resolved.priceId)) return;
    throw itemizeGraphqlError(
      'This plan is not available for checkout yet',
      'SERVICE_UNAVAILABLE',
      { reason: 'BILLING_PRICE_NOT_CONFIGURED' },
    );
  }

  private async startProviderCheckout(
    organizationId: number,
    customer: { customerId: string; existed: boolean },
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    idempotencyKey: string,
  ): Promise<{ session: BillingSession; checkoutCreated: boolean }> {
    if (customer.existed) {
      const active = await this.stripe.activeSubscription(customer.customerId);
      if (active) {
        // Never change an active subscription from an application CTA. The
        // Stripe portal presents the amount and proration before the customer
        // explicitly confirms a plan change.
        return {
          session: {
            url: await this.stripe.createPortalSession(
              customer.customerId,
              successUrl,
              `billing-portal:${organizationId}:${idempotencyKey}`,
            ),
          },
          checkoutCreated: false,
        };
      }
    }
    return {
      session: {
        url: await this.stripe.createCheckoutSession({
          customerId: customer.customerId,
          priceId,
          organizationId,
          successUrl,
          cancelUrl,
          idempotencyKey,
        }),
      },
      checkoutCreated: true,
    };
  }

  private async replaceMissingCustomer(
    organizationId: number,
  ): Promise<{ customerId: string; existed: boolean }> {
    const organization = await this.billing.checkoutOrganization(organizationId);
    if (!organization) {
      throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    }
    const customerId = await this.stripe.createCustomer({
      name: organization.name,
      email: organization.ownerEmail,
      organizationId,
      generation: String(Date.now()),
    });
    await this.billing.replaceStripeCustomer(organizationId, customerId);
    return { customerId, existed: false };
  }

  private providerFailure(error: unknown): never {
    const message = this.safeProviderMessage(error);
    this.logger.warn(
      `Billing provider request failed (${this.providerErrorCode(error)}): ${message}`,
    );
    throw itemizeGraphqlError(message, 'SERVICE_UNAVAILABLE', {
      reason: 'BILLING_PROVIDER_FAILURE',
    });
  }

  private safeProviderMessage(error: unknown): string {
    const details = this.providerErrorDetails(error);
    const message = details?.message ?? '';
    if (/sk_(live|test)_|rk_(live|test)_/i.test(message)) {
      return 'Billing provider request failed';
    }
    if (/live mode, but a test mode key/i.test(message)) {
      return 'Stripe test keys cannot checkout the live Solo/Studio prices';
    }
    if (/test mode, but a live mode key/i.test(message)) {
      return 'Stripe live keys cannot checkout test plan prices';
    }
    if (/no such price/i.test(message)) {
      return 'This plan is not configured in Stripe yet';
    }
    if (/no valid payment method types/i.test(message)) {
      return 'Stripe live mode has no card payments enabled. Activate Cards in the Stripe Dashboard payment methods settings.';
    }
    if (/already has (an existing |a )?subscription/i.test(message)) {
      return 'Could not switch plans automatically. Use Manage billing to change your plan.';
    }
    if (/customer portal/i.test(message) && /activat/i.test(message)) {
      return 'Stripe Customer Portal is not enabled yet';
    }
    return message || 'Billing provider request failed';
  }

  private providerErrorCode(error: unknown): string {
    return this.providerErrorDetails(error)?.code ?? 'unknown';
  }

  private isMissingStripeCustomer(error: unknown): boolean {
    const details = this.providerErrorDetails(error);
    if (!details) return false;
    if (/no such customer/i.test(details.message)) return true;
    return details.code === 'resource_missing' && details.param === 'customer';
  }

  private providerErrorDetails(
    error: unknown,
  ): { type: string; code?: string; param?: string; message: string } | null {
    if (!error || typeof error !== 'object') return null;
    const candidate = error as {
      type?: unknown;
      code?: unknown;
      param?: unknown;
      message?: unknown;
    };
    if (typeof candidate.message !== 'string' || typeof candidate.type !== 'string') {
      return null;
    }
    const isStripe =
      candidate.type.startsWith('Stripe') ||
      candidate.type.endsWith('_error');
    if (!isStripe) return null;
    return {
      type: candidate.type,
      message: candidate.message,
      ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
      ...(typeof candidate.param === 'string' ? { param: candidate.param } : {}),
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

  private requireSubscriptionBillingIsolation(): void {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ITEMIZE_SUBSCRIPTION_BILLING_ENABLED !== 'true'
    ) {
      throw itemizeGraphqlError(
        'Subscription checkout is temporarily unavailable',
        'SERVICE_UNAVAILABLE',
        { reason: 'BILLING_ISOLATION_REQUIRED' },
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
      trialStartedAt: row.trial_started_at,
      trialEligible:
        row.plan === 'free' &&
        row.subscription_status === 'none' &&
        !row.trial_started_at &&
        !row.stripe_subscription_id,
      trialEndsAt: row.trial_ends_at,
      trialEndAcknowledgedAt: row.trial_end_acknowledged_at,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      canceledAt: row.canceled_at,
    };
  }
}
