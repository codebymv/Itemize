const {
  API_LIMITS,
  CALENDAR_LIMITS,
  CONTACTS_LIMITS,
  EMAIL_LIMITS,
  FORM_LIMITS,
  LANDING_PAGE_LIMITS,
  PLAN_TIER_ORDER,
  PLANS,
  SMS_LIMITS,
  USERS_LIMITS,
  WORKFLOW_LIMITS,
  getPlanFromStripePrice,
} = require('../lib/subscription.constants');

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

function idFromReference(value) {
  if (typeof value === 'string') return value;
  return value && typeof value.id === 'string' ? value.id : null;
}

function verifyStripeSubscriptionWebhook({
  payload,
  signature,
  stripe,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
}) {
  if (!secret) {
    const error = new Error('Stripe webhook secret is not configured');
    error.code = 'WEBHOOK_NOT_CONFIGURED';
    throw error;
  }
  if (!Buffer.isBuffer(payload)) throw new Error('Raw webhook body is required');
  if (!signature || typeof signature !== 'string') throw new Error('Missing Stripe signature');
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

function normalizeStripeSubscriptionEvent(event) {
  if (!event || typeof event.id !== 'string' || event.id.length > 100) {
    throw new Error('Invalid Stripe event id');
  }
  if (typeof event.type !== 'string' || event.type.length > 100) {
    throw new Error('Invalid Stripe event type');
  }
  const object = event.data?.object;
  if (!object || typeof object.id !== 'string' || object.id.length > 100) {
    throw new Error('Invalid Stripe event object');
  }
  const createdSeconds = Number(event.created);
  const eventCreatedAt = new Date(createdSeconds * 1000);
  if (!Number.isFinite(createdSeconds) || createdSeconds <= 0 || Number.isNaN(eventCreatedAt.getTime())) {
    throw new Error('Invalid Stripe event timestamp');
  }

  return {
    customerId: idFromReference(object.customer),
    eventCreatedAt,
    eventId: event.id,
    eventType: event.type,
    object,
    objectId: object.id,
    subscriptionId: event.type.startsWith('customer.subscription.')
      ? object.id
      : idFromReference(object.subscription),
    supported: SUPPORTED_TYPES.has(event.type),
  };
}

function epochSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function snapshotStripeSubscriptionEvent(normalized) {
  const object = normalized.object;
  const price = object.items?.data?.[0]?.price;
  const pauseBehavior = object.pause_collection?.behavior;
  return {
    billingInterval: price?.recurring?.interval === 'year' ? 'year' : 'month',
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    currentPeriodEnd: epochSeconds(
      object.current_period_end || object.items?.data?.[0]?.current_period_end
    ),
    currentPeriodStart: epochSeconds(
      object.current_period_start || object.items?.data?.[0]?.current_period_start
    ),
    customerId: normalized.customerId,
    pauseCollection: pauseBehavior ? { behavior: String(pauseBehavior).slice(0, 50) } : null,
    priceId: typeof price?.id === 'string' ? price.id.slice(0, 100) : null,
    status: typeof object.status === 'string' ? object.status.slice(0, 30) : null,
    subscriptionId: normalized.subscriptionId,
    trialEnd: epochSeconds(object.trial_end),
    trialStart: epochSeconds(object.trial_start),
  };
}

function normalizedStripeSubscriptionEventFromClaim(claim) {
  const snapshot = claim.event_snapshot || {};
  const object = {
    id: claim.object_id,
    customer: snapshot.customerId || null,
    subscription: snapshot.subscriptionId || null,
    status: snapshot.status || null,
    current_period_start: snapshot.currentPeriodStart || null,
    current_period_end: snapshot.currentPeriodEnd || null,
    trial_start: snapshot.trialStart || null,
    trial_end: snapshot.trialEnd || null,
    cancel_at_period_end: Boolean(snapshot.cancelAtPeriodEnd),
    pause_collection: snapshot.pauseCollection || null,
    items: {
      data: snapshot.priceId ? [{
        price: {
          id: snapshot.priceId,
          recurring: { interval: snapshot.billingInterval === 'year' ? 'year' : 'month' },
        },
      }] : [],
    },
  };
  return normalizeStripeSubscriptionEvent({
    id: claim.stripe_event_id,
    type: claim.event_type,
    created: new Date(claim.object_created_at).getTime() / 1000,
    data: { object },
  });
}

function compareStripeProviderOrder(normalized, organization) {
  if (!organization.subscription_provider_updated_at) return 1;
  const incomingTime = normalized.eventCreatedAt.getTime();
  const currentTime = new Date(organization.subscription_provider_updated_at).getTime();
  if (incomingTime !== currentTime) return incomingTime > currentTime ? 1 : -1;
  const currentEventId = organization.subscription_provider_event_id;
  if (!currentEventId) return 1;
  if (normalized.eventId === currentEventId) return 0;
  return normalized.eventId > currentEventId ? 1 : -1;
}

function finiteLimit(limits, plan) {
  const value = limits[plan];
  return value === Infinity ? -1 : value;
}

async function markEvent(client, normalized, status, details = {}) {
  const reconciliationReason = status === 'unmatched' || status === 'ambiguous'
    ? status
    : null;
  await client.query(`
    UPDATE stripe_subscription_webhook_events SET
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
    WHERE stripe_event_id = $1
  `, [
    normalized.eventId,
    status,
    details.organizationId || null,
    details.previousPlan || null,
    details.newPlan || null,
    details.notificationType || null,
    details.notificationType ? 'pending' : 'not_required',
    reconciliationReason,
  ]);
  return { duplicate: false, status, ...details };
}

async function findOrganization(client, customerId, subscriptionId) {
  if (!customerId && !subscriptionId) return [];
  const result = await client.query(`
    SELECT id, plan, billing_period_start, subscription_provider_updated_at,
           subscription_provider_event_id
    FROM organizations
    WHERE ($1::varchar IS NOT NULL AND stripe_customer_id = $1)
       OR ($2::varchar IS NOT NULL AND stripe_subscription_id = $2)
    ORDER BY id
    FOR UPDATE
  `, [customerId, subscriptionId]);
  return result.rows;
}

function subscriptionPeriod(object) {
  const price = object.items?.data?.[0]?.price;
  const startSeconds = object.current_period_start || object.items?.data?.[0]?.current_period_start;
  const endSeconds = object.current_period_end || object.items?.data?.[0]?.current_period_end;
  return {
    billingPeriod: price?.recurring?.interval === 'year' || price?.id?.includes('yearly')
      ? 'yearly'
      : 'monthly',
    currentPeriodEnd: endSeconds ? new Date(Number(endSeconds) * 1000) : null,
    currentPeriodStart: startSeconds ? new Date(Number(startSeconds) * 1000) : null,
    priceId: price?.id || null,
  };
}

async function upsertSubscription(client, {
  billingPeriod,
  customerId,
  currentPeriodEnd,
  currentPeriodStart,
  eventCreatedAt,
  object,
  organizationId,
  plan,
  status,
  subscriptionId,
}) {
  const planResult = await client.query(
    'SELECT id FROM subscription_plans WHERE name = $1 LIMIT 1',
    [plan]
  );
  const planId = planResult.rows[0]?.id || null;
  await client.query(`
    INSERT INTO subscriptions (
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
      updated_at = CURRENT_TIMESTAMP
  `, [
    organizationId,
    planId,
    status,
    customerId,
    subscriptionId,
    billingPeriod,
    currentPeriodStart,
    currentPeriodEnd,
    object.trial_start ? new Date(Number(object.trial_start) * 1000) : null,
    object.trial_end ? new Date(Number(object.trial_end) * 1000) : null,
    status === 'canceled' ? eventCreatedAt : null,
    Boolean(object.cancel_at_period_end),
    JSON.stringify(object.pause_collection || null),
  ]);
}

async function recordAuditEvent(client, normalized, organizationId, previousPlan, newPlan) {
  await client.query(`
    INSERT INTO subscription_events (
      organization_id, event_type, stripe_event_id, metadata
    ) VALUES ($1, $2, $3, $4::jsonb)
  `, [
    organizationId,
    normalized.eventType,
    normalized.eventId,
    JSON.stringify({
      objectId: normalized.objectId,
      previousPlan: previousPlan || null,
      newPlan: newPlan || null,
    }),
  ]);
}

async function processSubscriptionUpdate(client, normalized, org) {
  const object = normalized.object;
  if (!SUBSCRIPTION_STATUSES.has(object.status)) throw new Error('Invalid Stripe subscription status');
  const period = subscriptionPeriod(object);
  let plan = org.plan || PLANS.STARTER;
  if (object.status === 'active' || object.status === 'trialing') {
    plan = getPlanFromStripePrice(period.priceId) || plan;
  }
  if (!(plan in EMAIL_LIMITS)) plan = PLANS.STARTER;
  const resetUsage = period.currentPeriodStart
    && (!org.billing_period_start
      || period.currentPeriodStart.getTime() > new Date(org.billing_period_start).getTime());

  await client.query(`
    UPDATE organizations SET
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
    WHERE id = $21
  `, [
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
  ]);

  await upsertSubscription(client, {
    ...period,
    customerId: normalized.customerId,
    eventCreatedAt: normalized.eventCreatedAt,
    object,
    organizationId: org.id,
    plan,
    status: object.status,
    subscriptionId: object.id,
  });
  await recordAuditEvent(client, normalized, org.id, org.plan, plan);
  const isUpgrade = (PLAN_TIER_ORDER[plan] ?? -1) > (PLAN_TIER_ORDER[org.plan] ?? -1);
  return markEvent(client, normalized, 'processed', {
    newPlan: plan,
    notificationType: isUpgrade ? 'subscription_upgraded' : null,
    organizationId: org.id,
    previousPlan: org.plan,
  });
}

async function processTerminalEvent(client, normalized, org, status) {
  await client.query(`
    UPDATE organizations SET
      subscription_status = $1::varchar,
      canceled_at = CASE WHEN $1::varchar = 'canceled' THEN $2 ELSE canceled_at END,
      subscription_provider_updated_at = $2,
      subscription_provider_event_id = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
  `, [status, normalized.eventCreatedAt, normalized.eventId, org.id]);
  await client.query(`
    UPDATE subscriptions SET
      status = $1::varchar,
      canceled_at = CASE WHEN $1::varchar = 'canceled' THEN $2 ELSE canceled_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE organization_id = $3
  `, [status, normalized.eventCreatedAt, org.id]);
  await recordAuditEvent(client, normalized, org.id, org.plan, org.plan);
  return markEvent(client, normalized, 'processed', {
    newPlan: org.plan,
    organizationId: org.id,
    previousPlan: org.plan,
  });
}

async function processStripeSubscriptionEvent(client, event) {
  const normalized = normalizeStripeSubscriptionEvent(event);
  const eventSnapshot = snapshotStripeSubscriptionEvent(normalized);
  const claim = await client.query(`
    INSERT INTO stripe_subscription_webhook_events (
      stripe_event_id, event_type, object_id, object_created_at, event_snapshot
    ) VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING stripe_event_id
  `, [
    normalized.eventId,
    normalized.eventType,
    normalized.objectId,
    normalized.eventCreatedAt,
    JSON.stringify(eventSnapshot),
  ]);
  if (claim.rows.length === 0) return { duplicate: true, status: 'duplicate' };
  if (!normalized.supported || normalized.eventType === 'checkout.session.completed') {
    return markEvent(client, normalized, 'ignored');
  }

  const organizations = await findOrganization(
    client,
    normalized.customerId,
    normalized.subscriptionId
  );
  if (organizations.length === 0) return markEvent(client, normalized, 'unmatched');
  if (organizations.length > 1) return markEvent(client, normalized, 'ambiguous');
  const org = organizations[0];
  if (compareStripeProviderOrder(normalized, org) <= 0) {
    return markEvent(client, normalized, 'stale', { organizationId: org.id });
  }

  if (normalized.eventType === 'customer.subscription.deleted') {
    return processTerminalEvent(client, normalized, org, 'canceled');
  }
  if (normalized.eventType === 'invoice.payment_failed') {
    return processTerminalEvent(client, normalized, org, 'past_due');
  }
  return processSubscriptionUpdate(client, normalized, org);
}

async function reconcileStripeSubscriptionEvent(client, eventId) {
  const claim = await client.query(`
    SELECT *
    FROM stripe_subscription_webhook_events
    WHERE stripe_event_id = $1
      AND reconciliation_status = 'processing'
    FOR UPDATE
  `, [eventId]);
  if (claim.rows.length === 0) throw new Error('Stripe reconciliation claim is unavailable');
  const normalized = normalizedStripeSubscriptionEventFromClaim(claim.rows[0]);
  const organizations = await findOrganization(
    client,
    normalized.customerId,
    normalized.subscriptionId
  );
  if (organizations.length !== 1) {
    const error = new Error('Stripe subscription mapping is not uniquely resolvable');
    error.code = 'RECONCILIATION_UNRESOLVED';
    throw error;
  }
  const org = organizations[0];
  let result;
  if (compareStripeProviderOrder(normalized, org) <= 0) {
    result = await markEvent(client, normalized, 'stale', { organizationId: org.id });
  } else if (normalized.eventType === 'customer.subscription.deleted') {
    result = await processTerminalEvent(client, normalized, org, 'canceled');
  } else if (normalized.eventType === 'invoice.payment_failed') {
    result = await processTerminalEvent(client, normalized, org, 'past_due');
  } else {
    result = await processSubscriptionUpdate(client, normalized, org);
  }
  await client.query(`
    UPDATE stripe_subscription_webhook_events SET
      reconciliation_status = 'resolved',
      reconciliation_reason = NULL,
      reconciliation_next_attempt_at = NULL,
      reconciliation_lease_expires_at = NULL,
      reconciliation_last_error = NULL,
      reconciled_at = CURRENT_TIMESTAMP
    WHERE stripe_event_id = $1
  `, [eventId]);
  return result;
}

module.exports = {
  compareStripeProviderOrder,
  normalizeStripeSubscriptionEvent,
  normalizedStripeSubscriptionEventFromClaim,
  processStripeSubscriptionEvent,
  reconcileStripeSubscriptionEvent,
  snapshotStripeSubscriptionEvent,
  verifyStripeSubscriptionWebhook,
};
