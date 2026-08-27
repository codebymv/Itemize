/**
 * Faithful port of the retained Stripe subscription webhook processor
 * (backend/src/services/subscriptionWebhookService.js). The durable
 * event claim, minimal replay snapshot, deterministic provider
 * ordering, tenant locks, plan/limit writes, subscription upsert,
 * audit trail, and notification marking must not drift while both
 * runtimes serve the receiver. reconcileEvent mirrors the legacy
 * reconciliation replay so the NestJS workers can drain the shared
 * tables with identical outcomes.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  API_LIMITS,
  CALENDAR_LIMITS,
  CONTACTS_LIMITS,
  EMAIL_LIMITS,
  finiteLimit,
  FORM_LIMITS,
  getPlanFromStripePrice,
  LANDING_PAGE_LIMITS,
  PLAN_TIER_ORDER,
  planDisplayName,
  PLANS,
  SMS_LIMITS,
  USERS_LIMITS,
  WORKFLOW_LIMITS,
} from './subscription-plan.constants';

export class SubscriptionWebhookInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionWebhookInputError';
  }
}

const SUPPORTED_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
]);

type StripeObject = {
  id: string;
  customer?: unknown;
  subscription?: unknown;
  status?: string;
  current_period_start?: unknown;
  current_period_end?: unknown;
  trial_start?: unknown;
  trial_end?: unknown;
  cancel_at_period_end?: unknown;
  pause_collection?: { behavior?: unknown } | null;
  items?: {
    data?: Array<{
      price?: { id?: string; recurring?: { interval?: string } };
      current_period_start?: unknown;
      current_period_end?: unknown;
    }>;
  };
};

type NormalizedEvent = {
  customerId: string | null;
  eventCreatedAt: Date;
  eventId: string;
  eventType: string;
  object: StripeObject;
  objectId: string;
  subscriptionId: string | null;
  supported: boolean;
};

type OrganizationRow = {
  id: number;
  plan: string | null;
  subscription_status: string | null;
  billing_period_start: Date | null;
  subscription_provider_updated_at: Date | null;
  subscription_provider_event_id: string | null;
};

export type SubscriptionWebhookResult = {
  duplicate: boolean;
  status: string;
  organizationId?: number | null;
  previousPlan?: string | null;
  newPlan?: string | null;
  notificationType?: string | null;
};

const idFromReference = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return value && typeof (value as { id?: unknown }).id === 'string'
    ? ((value as { id: string }).id)
    : null;
};

export function normalizeStripeSubscriptionEvent(
  event: unknown,
): NormalizedEvent {
  const parsed = event as {
    id?: unknown;
    type?: unknown;
    created?: unknown;
    data?: { object?: StripeObject };
  };
  if (!parsed || typeof parsed.id !== 'string' || parsed.id.length > 100) {
    throw new SubscriptionWebhookInputError('Invalid Stripe event id');
  }
  if (typeof parsed.type !== 'string' || parsed.type.length > 100) {
    throw new SubscriptionWebhookInputError('Invalid Stripe event type');
  }
  const object = parsed.data?.object;
  if (!object || typeof object.id !== 'string' || object.id.length > 100) {
    throw new SubscriptionWebhookInputError('Invalid Stripe event object');
  }
  const createdSeconds = Number(parsed.created);
  const eventCreatedAt = new Date(createdSeconds * 1000);
  if (
    !Number.isFinite(createdSeconds) ||
    createdSeconds <= 0 ||
    Number.isNaN(eventCreatedAt.getTime())
  ) {
    throw new SubscriptionWebhookInputError('Invalid Stripe event timestamp');
  }

  return {
    customerId: idFromReference(object.customer),
    eventCreatedAt,
    eventId: parsed.id,
    eventType: parsed.type,
    object,
    objectId: object.id,
    subscriptionId: parsed.type.startsWith('customer.subscription.')
      ? object.id
      : idFromReference(object.subscription),
    supported: SUPPORTED_TYPES.has(parsed.type),
  };
}

const epochSeconds = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function snapshotStripeSubscriptionEvent(normalized: NormalizedEvent) {
  const object = normalized.object;
  const price = object.items?.data?.[0]?.price;
  const pauseBehavior = object.pause_collection?.behavior;
  return {
    billingInterval: price?.recurring?.interval === 'year' ? 'year' : 'month',
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    currentPeriodEnd: epochSeconds(
      object.current_period_end || object.items?.data?.[0]?.current_period_end,
    ),
    currentPeriodStart: epochSeconds(
      object.current_period_start ||
        object.items?.data?.[0]?.current_period_start,
    ),
    customerId: normalized.customerId,
    pauseCollection: pauseBehavior
      ? { behavior: String(pauseBehavior).slice(0, 50) }
      : null,
    priceId: typeof price?.id === 'string' ? price.id.slice(0, 100) : null,
    status:
      typeof object.status === 'string' ? object.status.slice(0, 30) : null,
    subscriptionId: normalized.subscriptionId,
    trialEnd: epochSeconds(object.trial_end),
    trialStart: epochSeconds(object.trial_start),
  };
}

export type SubscriptionWebhookClaimRow = {
  stripe_event_id: string;
  event_type: string;
  object_id: string;
  object_created_at: Date | string;
  event_snapshot: {
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
    currentPeriodStart?: number | null;
    currentPeriodEnd?: number | null;
    trialStart?: number | null;
    trialEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
    pauseCollection?: { behavior?: string } | null;
    priceId?: string | null;
    billingInterval?: string | null;
  } | null;
};

export function normalizedStripeSubscriptionEventFromClaim(
  claim: SubscriptionWebhookClaimRow,
): NormalizedEvent {
  const snapshot = claim.event_snapshot || {};
  const object: StripeObject = {
    id: claim.object_id,
    customer: snapshot.customerId || null,
    subscription: snapshot.subscriptionId || null,
    status: snapshot.status || undefined,
    current_period_start: snapshot.currentPeriodStart || null,
    current_period_end: snapshot.currentPeriodEnd || null,
    trial_start: snapshot.trialStart || null,
    trial_end: snapshot.trialEnd || null,
    cancel_at_period_end: Boolean(snapshot.cancelAtPeriodEnd),
    pause_collection: snapshot.pauseCollection || null,
    items: {
      data: snapshot.priceId
        ? [
            {
              price: {
                id: snapshot.priceId,
                recurring: {
                  interval:
                    snapshot.billingInterval === 'year' ? 'year' : 'month',
                },
              },
            },
          ]
        : [],
    },
  };
  return normalizeStripeSubscriptionEvent({
    id: claim.stripe_event_id,
    type: claim.event_type,
    created: new Date(claim.object_created_at).getTime() / 1000,
    data: { object },
  });
}

export function compareStripeProviderOrder(
  normalized: NormalizedEvent,
  organization: OrganizationRow,
): number {
  if (!organization.subscription_provider_updated_at) return 1;
  const incomingTime = normalized.eventCreatedAt.getTime();
  const currentTime = new Date(
    organization.subscription_provider_updated_at,
  ).getTime();
  if (incomingTime !== currentTime) return incomingTime > currentTime ? 1 : -1;
  const currentEventId = organization.subscription_provider_event_id;
  if (!currentEventId) return 1;
  if (normalized.eventId === currentEventId) return 0;
  return normalized.eventId > currentEventId ? 1 : -1;
}

@Injectable()
export class SubscriptionWebhooksService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async processStripeSubscriptionEvent(
    event: unknown,
  ): Promise<SubscriptionWebhookResult> {
    const normalized = normalizeStripeSubscriptionEvent(event);
    const eventSnapshot = snapshotStripeSubscriptionEvent(normalized);
    return this.transaction(async (client) => {
      const claim = await client.query(
        `INSERT INTO stripe_subscription_webhook_events (
           stripe_event_id, event_type, object_id, object_created_at, event_snapshot
         ) VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (stripe_event_id) DO NOTHING
         RETURNING stripe_event_id`,
        [
          normalized.eventId,
          normalized.eventType,
          normalized.objectId,
          normalized.eventCreatedAt,
          JSON.stringify(eventSnapshot),
        ],
      );
      if (claim.rows.length === 0) {
        return { duplicate: true, status: 'duplicate' };
      }
      if (
        !normalized.supported ||
        normalized.eventType === 'checkout.session.completed'
      ) {
        return this.markEvent(client, normalized, 'ignored');
      }

      const organizations = await this.findOrganization(
        client,
        normalized.customerId,
        normalized.subscriptionId,
      );
      if (organizations.length === 0) {
        return this.markEvent(client, normalized, 'unmatched');
      }
      if (organizations.length > 1) {
        return this.markEvent(client, normalized, 'ambiguous');
      }
      const org = organizations[0];
      if (compareStripeProviderOrder(normalized, org) <= 0) {
        return this.markEvent(client, normalized, 'stale', {
          organizationId: org.id,
        });
      }

      if (normalized.eventType === 'customer.subscription.deleted') {
        return this.processTerminalEvent(client, normalized, org, 'canceled');
      }
      if (normalized.eventType === 'invoice.payment_failed') {
        return this.processTerminalEvent(client, normalized, org, 'past_due');
      }
      return this.processSubscriptionUpdate(client, normalized, org);
    });
  }

  async reconcileEvent(
    client: PoolClient,
    eventId: string,
  ): Promise<SubscriptionWebhookResult> {
    const claim = await client.query<SubscriptionWebhookClaimRow>(
      `SELECT *
       FROM stripe_subscription_webhook_events
       WHERE stripe_event_id = $1
         AND reconciliation_status = 'processing'
       FOR UPDATE`,
      [eventId],
    );
    if (claim.rows.length === 0) {
      throw new Error('Stripe reconciliation claim is unavailable');
    }
    const normalized = normalizedStripeSubscriptionEventFromClaim(
      claim.rows[0],
    );
    const organizations = await this.findOrganization(
      client,
      normalized.customerId,
      normalized.subscriptionId,
    );
    if (organizations.length !== 1) {
      const error = new Error(
        'Stripe subscription mapping is not uniquely resolvable',
      );
      (error as Error & { code?: string }).code = 'RECONCILIATION_UNRESOLVED';
      throw error;
    }
    const org = organizations[0];
    let result: SubscriptionWebhookResult;
    if (compareStripeProviderOrder(normalized, org) <= 0) {
      result = await this.markEvent(client, normalized, 'stale', {
        organizationId: org.id,
      });
    } else if (normalized.eventType === 'customer.subscription.deleted') {
      result = await this.processTerminalEvent(
        client,
        normalized,
        org,
        'canceled',
      );
    } else if (normalized.eventType === 'invoice.payment_failed') {
      result = await this.processTerminalEvent(
        client,
        normalized,
        org,
        'past_due',
      );
    } else {
      result = await this.processSubscriptionUpdate(client, normalized, org);
    }
    await client.query(
      `UPDATE stripe_subscription_webhook_events SET
         reconciliation_status = 'resolved',
         reconciliation_reason = NULL,
         reconciliation_next_attempt_at = NULL,
         reconciliation_lease_expires_at = NULL,
         reconciliation_last_error = NULL,
         reconciled_at = CURRENT_TIMESTAMP
       WHERE stripe_event_id = $1`,
      [eventId],
    );
    return result;
  }

  private async findOrganization(
    client: PoolClient,
    customerId: string | null,
    subscriptionId: string | null,
  ): Promise<OrganizationRow[]> {
    if (!customerId && !subscriptionId) return [];
    const result = await client.query<OrganizationRow>(
      `SELECT id, plan, subscription_status, billing_period_start, subscription_provider_updated_at,
              subscription_provider_event_id
       FROM organizations
       WHERE ($1::varchar IS NOT NULL AND stripe_customer_id = $1)
          OR ($2::varchar IS NOT NULL AND stripe_subscription_id = $2)
       ORDER BY id
       FOR UPDATE`,
      [customerId, subscriptionId],
    );
    return result.rows;
  }

  private async markEvent(
    client: PoolClient,
    normalized: NormalizedEvent,
    status: string,
    details: {
      organizationId?: number | null;
      previousPlan?: string | null;
      newPlan?: string | null;
      notificationType?: string | null;
    } = {},
  ): Promise<SubscriptionWebhookResult> {
    const reconciliationReason =
      status === 'unmatched' || status === 'ambiguous' ? status : null;
    await client.query(
      `UPDATE stripe_subscription_webhook_events SET
         processing_status = $2::varchar,
         organization_id = $3,
         previous_plan = $4,
         new_plan = $5,
         notification_type = $6,
         notification_status = $7::varchar,
         notification_next_attempt_at = CASE WHEN $6::varchar IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
         reconciliation_status = CASE
           WHEN $8::varchar IS NULL THEN reconciliation_status
           ELSE 'pending'
         END,
         reconciliation_reason = COALESCE($8::varchar, reconciliation_reason),
         reconciliation_next_attempt_at = CASE
           WHEN $8::varchar IS NULL THEN reconciliation_next_attempt_at
           ELSE CURRENT_TIMESTAMP
         END,
         processed_at = CURRENT_TIMESTAMP
       WHERE stripe_event_id = $1`,
      [
        normalized.eventId,
        status,
        details.organizationId || null,
        details.previousPlan || null,
        details.newPlan || null,
        details.notificationType || null,
        details.notificationType ? 'pending' : 'not_required',
        reconciliationReason,
      ],
    );
    return { duplicate: false, status, ...details };
  }

  private subscriptionPeriod(object: StripeObject) {
    const price = object.items?.data?.[0]?.price;
    const startSeconds =
      object.current_period_start ||
      object.items?.data?.[0]?.current_period_start;
    const endSeconds =
      object.current_period_end || object.items?.data?.[0]?.current_period_end;
    return {
      billingPeriod:
        price?.recurring?.interval === 'year' || price?.id?.includes('yearly')
          ? 'yearly'
          : 'monthly',
      currentPeriodEnd: endSeconds
        ? new Date(Number(endSeconds) * 1000)
        : null,
      currentPeriodStart: startSeconds
        ? new Date(Number(startSeconds) * 1000)
        : null,
      priceId: price?.id || null,
    };
  }

  private async upsertSubscription(
    client: PoolClient,
    values: {
      billingPeriod: string;
      customerId: string | null;
      currentPeriodEnd: Date | null;
      currentPeriodStart: Date | null;
      eventCreatedAt: Date;
      object: StripeObject;
      organizationId: number;
      plan: string;
      status: string;
      subscriptionId: string;
    },
  ): Promise<void> {
    const planResult = await client.query<{ id: number }>(
      'SELECT id FROM subscription_plans WHERE name = $1 LIMIT 1',
      [values.plan],
    );
    const planId = planResult.rows[0]?.id || null;
    const object = values.object;
    await client.query(
      `INSERT INTO subscriptions (
         organization_id, plan_id, status, stripe_customer_id,
         stripe_subscription_id, billing_period, current_period_start,
         current_period_end, trial_start, trial_end, canceled_at,
         cancel_at_period_end, pause_collection, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, '{}'::jsonb)
       ON CONFLICT (organization_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
         stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
         billing_period = EXCLUDED.billing_period,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         trial_start = EXCLUDED.trial_start,
         trial_end = EXCLUDED.trial_end,
         canceled_at = EXCLUDED.canceled_at,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         pause_collection = EXCLUDED.pause_collection,
         updated_at = CURRENT_TIMESTAMP`,
      [
        values.organizationId,
        planId,
        values.status,
        values.customerId,
        values.subscriptionId,
        values.billingPeriod,
        values.currentPeriodStart,
        values.currentPeriodEnd,
        object.trial_start ? new Date(Number(object.trial_start) * 1000) : null,
        object.trial_end ? new Date(Number(object.trial_end) * 1000) : null,
        values.status === 'canceled' ? values.eventCreatedAt : null,
        Boolean(object.cancel_at_period_end),
        JSON.stringify(object.pause_collection || null),
      ],
    );
  }

  private async recordAuditEvent(
    client: PoolClient,
    normalized: NormalizedEvent,
    organizationId: number,
    previousPlan: string | null,
    newPlan: string | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscription_events (
         organization_id, event_type, stripe_event_id, metadata
       ) VALUES ($1, $2, $3, $4::jsonb)`,
      [
        organizationId,
        normalized.eventType,
        normalized.eventId,
        JSON.stringify({
          objectId: normalized.objectId,
          previousPlan: previousPlan || null,
          newPlan: newPlan || null,
        }),
      ],
    );
  }

  private async processSubscriptionUpdate(
    client: PoolClient,
    normalized: NormalizedEvent,
    org: OrganizationRow,
  ): Promise<SubscriptionWebhookResult> {
    const object = normalized.object;
    if (!SUBSCRIPTION_STATUSES.has(object.status as string)) {
      throw new SubscriptionWebhookInputError(
        'Invalid Stripe subscription status',
      );
    }
    const period = this.subscriptionPeriod(object);
    let plan = org.plan || PLANS.STARTER;
    if (object.status === 'active' || object.status === 'trialing') {
      plan = getPlanFromStripePrice(period.priceId) || plan;
    }
    if (!(plan in EMAIL_LIMITS)) plan = PLANS.STARTER;
    const resetUsage =
      period.currentPeriodStart &&
      (!org.billing_period_start ||
        period.currentPeriodStart.getTime() >
          new Date(org.billing_period_start).getTime());

    await client.query(
      `UPDATE organizations SET
         plan = $1,
         subscription_status = $2::varchar,
         stripe_subscription_id = $3,
         billing_period = $4,
         billing_period_start = $5,
         billing_period_end = $6,
         emails_limit = $7,
         sms_limit = $8,
         api_calls_limit = $9,
         contacts_limit = $10,
         users_limit = $11,
         workflows_limit = $12,
         landing_pages_limit = $13,
         forms_limit = $14,
         calendars_limit = $15,
         cancel_at_period_end = $16,
         trial_ends_at = $17,
         emails_used = CASE WHEN $18 THEN 0 ELSE emails_used END,
         sms_used = CASE WHEN $18 THEN 0 ELSE sms_used END,
         api_calls_used = CASE WHEN $18 THEN 0 ELSE api_calls_used END,
         canceled_at = CASE WHEN $2::varchar = 'canceled' THEN COALESCE(canceled_at, $19) ELSE NULL END,
         subscription_provider_updated_at = $19,
         subscription_provider_event_id = $20,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $21`,
      [
        plan,
        object.status,
        object.id,
        period.billingPeriod,
        period.currentPeriodStart,
        period.currentPeriodEnd,
        finiteLimit(EMAIL_LIMITS, plan),
        finiteLimit(SMS_LIMITS, plan),
        finiteLimit(API_LIMITS, plan),
        finiteLimit(CONTACTS_LIMITS, plan),
        finiteLimit(USERS_LIMITS, plan),
        finiteLimit(WORKFLOW_LIMITS, plan),
        finiteLimit(LANDING_PAGE_LIMITS, plan),
        finiteLimit(FORM_LIMITS, plan),
        finiteLimit(CALENDAR_LIMITS, plan),
        Boolean(object.cancel_at_period_end),
        object.trial_end ? new Date(Number(object.trial_end) * 1000) : null,
        Boolean(resetUsage),
        normalized.eventCreatedAt,
        normalized.eventId,
        org.id,
      ],
    );

    await this.upsertSubscription(client, {
      ...period,
      customerId: normalized.customerId,
      eventCreatedAt: normalized.eventCreatedAt,
      object,
      organizationId: org.id,
      plan,
      status: object.status as string,
      subscriptionId: object.id,
    });
    await this.recordAuditEvent(client, normalized, org.id, org.plan, plan);
    if (org.plan !== plan) {
      await this.enqueuePlanChangedNotification(
        client,
        normalized,
        org.id,
        org.plan,
        plan,
      );
    }
    const isUpgrade =
      (PLAN_TIER_ORDER[plan] ?? -1) > (PLAN_TIER_ORDER[org.plan ?? ''] ?? -1);
    const isActivation =
      object.status === 'active' && org.subscription_status !== 'active';
    return this.markEvent(client, normalized, 'processed', {
      newPlan: plan,
      notificationType: isUpgrade
        ? 'subscription_upgraded'
        : isActivation
          ? 'subscription_activated'
          : null,
      organizationId: org.id,
      previousPlan: org.plan,
    });
  }

  private async processTerminalEvent(
    client: PoolClient,
    normalized: NormalizedEvent,
    org: OrganizationRow,
    status: string,
  ): Promise<SubscriptionWebhookResult> {
    const canceled = status === 'canceled';
    const terminalPlan = canceled ? PLANS.FREE : (org.plan || PLANS.FREE);
    await client.query(
      `UPDATE organizations SET
         plan = $1,
         subscription_status = $3::varchar,
         stripe_subscription_id = CASE WHEN $2 THEN NULL ELSE stripe_subscription_id END,
         cancel_at_period_end = CASE WHEN $2 THEN FALSE ELSE cancel_at_period_end END,
         emails_limit = CASE WHEN $2 THEN $4 ELSE emails_limit END,
         sms_limit = CASE WHEN $2 THEN $5 ELSE sms_limit END,
         api_calls_limit = CASE WHEN $2 THEN $6 ELSE api_calls_limit END,
         contacts_limit = CASE WHEN $2 THEN $7 ELSE contacts_limit END,
         users_limit = CASE WHEN $2 THEN $8 ELSE users_limit END,
         workflows_limit = CASE WHEN $2 THEN $9 ELSE workflows_limit END,
         landing_pages_limit = CASE WHEN $2 THEN $10 ELSE landing_pages_limit END,
         forms_limit = CASE WHEN $2 THEN $11 ELSE forms_limit END,
         calendars_limit = CASE WHEN $2 THEN $12 ELSE calendars_limit END,
         canceled_at = CASE WHEN $2 THEN $13 ELSE canceled_at END,
         subscription_provider_updated_at = $13,
         subscription_provider_event_id = $14,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $15`,
      [
        terminalPlan,
        canceled,
        status,
        finiteLimit(EMAIL_LIMITS, PLANS.FREE),
        finiteLimit(SMS_LIMITS, PLANS.FREE),
        finiteLimit(API_LIMITS, PLANS.FREE),
        finiteLimit(CONTACTS_LIMITS, PLANS.FREE),
        finiteLimit(USERS_LIMITS, PLANS.FREE),
        finiteLimit(WORKFLOW_LIMITS, PLANS.FREE),
        finiteLimit(LANDING_PAGE_LIMITS, PLANS.FREE),
        finiteLimit(FORM_LIMITS, PLANS.FREE),
        finiteLimit(CALENDAR_LIMITS, PLANS.FREE),
        normalized.eventCreatedAt,
        normalized.eventId,
        org.id,
      ],
    );
    await client.query(
      `UPDATE subscriptions SET
         status = $1::varchar,
         canceled_at = CASE WHEN $1::varchar = 'canceled' THEN $2 ELSE canceled_at END,
         updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = $3`,
      [status, normalized.eventCreatedAt, org.id],
    );
    await this.recordAuditEvent(
      client,
      normalized,
      org.id,
      org.plan,
      terminalPlan,
    );
    if (org.plan !== terminalPlan) {
      await this.enqueuePlanChangedNotification(
        client,
        normalized,
        org.id,
        org.plan,
        terminalPlan,
      );
    }
    return this.markEvent(client, normalized, 'processed', {
      newPlan: terminalPlan,
      organizationId: org.id,
      previousPlan: org.plan,
    });
  }

  private async enqueuePlanChangedNotification(
    client: PoolClient,
    normalized: NormalizedEvent,
    organizationId: number,
    previousPlan: string | null,
    newPlan: string,
  ): Promise<void> {
    const previousName = planDisplayName(previousPlan || PLANS.FREE);
    const newName = planDisplayName(newPlan);
    await this.notifications.createForOrganizationOwnerWithClient(client, {
      organizationId,
      eventType: 'subscription.plan_changed',
      dedupeKey: `stripe:${normalized.eventId}:plan-changed`,
      payload: {
        previousPlan: previousPlan || PLANS.FREE,
        newPlan,
        stripeEventId: normalized.eventId,
      },
      category: 'billing',
      priority: 'normal',
      title: `Plan changed to ${newName}`,
      body: `Your Itemize plan changed from ${previousName} to ${newName}.`,
      href: '/settings',
      occurredAt: normalized.eventCreatedAt,
    });
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
