/**
 * Faithful port of the retained Resend webhook processor
 * (backend/src/services/emailWebhookService.js). Event normalization,
 * status-regression protection, ambiguous-tenant quarantine, and the
 * durable svix-id claim semantics must stay identical while both
 * runtimes serve the receiver. reconcileEvent mirrors the legacy
 * reconciliation replay so the NestJS worker can drain the shared
 * email_webhook_events table with identical outcomes.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export class EmailWebhookInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailWebhookInputError';
  }
}

type EventConfig = {
  emailLogStatus?: string;
  campaignStatus?: string;
  sent?: boolean;
  delivered?: boolean;
  opened?: boolean;
  clicked?: boolean;
  bounced?: boolean;
  unsubscribed?: boolean;
  suppressed?: boolean;
};

export const EVENT_CONFIG: Readonly<Record<string, EventConfig>> = Object.freeze({
  'email.scheduled': { emailLogStatus: 'queued', campaignStatus: 'pending' },
  'email.sent': { emailLogStatus: 'sent', campaignStatus: 'sent', sent: true },
  'email.delivered': { emailLogStatus: 'delivered', campaignStatus: 'delivered', delivered: true },
  'email.opened': { emailLogStatus: 'opened', campaignStatus: 'opened', opened: true },
  'email.clicked': { emailLogStatus: 'clicked', campaignStatus: 'clicked', clicked: true },
  'email.bounced': { emailLogStatus: 'bounced', campaignStatus: 'bounced', bounced: true },
  'email.complained': { emailLogStatus: 'unsubscribed', campaignStatus: 'complained', unsubscribed: true },
  'email.failed': { emailLogStatus: 'failed', campaignStatus: 'failed' },
  'email.suppressed': { emailLogStatus: 'failed', campaignStatus: 'failed', suppressed: true },
  'email.delivery_delayed': {},
});

const STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  pending: 0,
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
  unsubscribed: 5,
});

type NormalizedEvent = {
  config: EventConfig | null;
  deliveryId: string;
  details: Record<string, string | null>;
  eventCreatedAt: Date;
  eventType: string;
  externalId: string;
};

type TargetRow = {
  id: number;
  organization_id: number;
  contact_id: number | null;
  status: string;
  provider_status_at: Date | null;
};

export type EmailWebhookResult = {
  duplicate: boolean;
  matched: boolean;
  pending?: boolean;
  ignored?: boolean;
  reason?: string;
};

const boundedText = (value: unknown, limit: number): string | null => {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, limit);
};

export function normalizeEmailWebhook(
  deliveryId: unknown,
  event: unknown,
): NormalizedEvent {
  if (!deliveryId || typeof deliveryId !== 'string' || deliveryId.length > 255) {
    throw new EmailWebhookInputError('Invalid webhook delivery id');
  }
  const parsed = event as {
    type?: unknown;
    created_at?: unknown;
    data?: {
      email_id?: unknown;
      created_at?: unknown;
      bounce?: { type?: unknown; subType?: unknown; message?: unknown };
      failed?: { reason?: unknown };
      suppressed?: { type?: unknown; message?: unknown };
      click?: { link?: unknown };
    };
  };
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    throw new EmailWebhookInputError('Invalid webhook event');
  }

  const externalId = parsed.data?.email_id;
  if (!externalId || typeof externalId !== 'string' || externalId.length > 255) {
    throw new EmailWebhookInputError('Invalid email provider id');
  }
  const eventCreatedAt = new Date(
    (parsed.created_at || parsed.data?.created_at) as string,
  );
  if (Number.isNaN(eventCreatedAt.getTime())) {
    throw new EmailWebhookInputError('Invalid webhook event timestamp');
  }

  const details: Record<string, string | null> = {};
  if (parsed.data?.bounce) {
    details.bounceType = boundedText(parsed.data.bounce.type, 50);
    details.bounceSubType = boundedText(parsed.data.bounce.subType, 100);
    details.message = boundedText(parsed.data.bounce.message, 2000);
  }
  if (parsed.data?.failed?.reason) {
    details.message = boundedText(parsed.data.failed.reason, 2000);
  }
  if (parsed.data?.suppressed) {
    details.suppressionType = boundedText(parsed.data.suppressed.type, 100);
    details.message = boundedText(parsed.data.suppressed.message, 2000);
  }
  if (parsed.data?.click?.link) {
    details.link = boundedText(parsed.data.click.link, 2048);
  }

  return {
    config: EVENT_CONFIG[parsed.type] || null,
    deliveryId,
    details,
    eventCreatedAt,
    eventType: parsed.type,
    externalId,
  };
}

export type EmailWebhookClaimRow = {
  svix_id: string;
  event_type: string;
  external_id: string;
  event_created_at: Date | string;
  details: Record<string, string | null> | null;
};

export function normalizedEmailWebhookFromClaim(
  claim: EmailWebhookClaimRow,
): NormalizedEvent {
  const eventCreatedAt = new Date(claim.event_created_at);
  if (Number.isNaN(eventCreatedAt.getTime())) {
    throw new Error('Invalid stored email event timestamp');
  }
  return {
    config: EVENT_CONFIG[claim.event_type] || null,
    deliveryId: claim.svix_id,
    details:
      claim.details && typeof claim.details === 'object' ? claim.details : {},
    eventCreatedAt,
    eventType: claim.event_type,
    externalId: claim.external_id,
  };
}

export function shouldReplaceStatus(
  currentTimestamp: Date | null,
  eventCreatedAt: Date,
  currentStatus: string,
  nextStatus: string,
): boolean {
  if (!currentTimestamp) return true;
  const timestampDifference =
    eventCreatedAt.getTime() - new Date(currentTimestamp).getTime();
  if (timestampDifference !== 0) return timestampDifference > 0;
  return (STATUS_RANK[nextStatus] ?? -1) >= (STATUS_RANK[currentStatus] ?? -1);
}

export function shouldSuppressContact(
  eventType: string,
  details: Record<string, string | null>,
): boolean {
  if (eventType === 'email.complained' || eventType === 'email.suppressed') {
    return true;
  }
  return (
    eventType === 'email.bounced' &&
    String(details.bounceType || '').toLowerCase() === 'permanent'
  );
}

@Injectable()
export class EmailWebhooksService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async processResendEvent(
    deliveryId: unknown,
    event: unknown,
  ): Promise<EmailWebhookResult> {
    const normalized = normalizeEmailWebhook(deliveryId, event);
    return this.transaction(async (client) => {
      const claim = await client.query(
        `INSERT INTO email_webhook_events
           (svix_id, event_type, external_id, event_created_at, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (svix_id) DO NOTHING
         RETURNING svix_id`,
        [
          normalized.deliveryId,
          normalized.eventType,
          normalized.externalId,
          normalized.eventCreatedAt.toISOString(),
          JSON.stringify(normalized.details),
        ],
      );
      if (claim.rows.length === 0) return { duplicate: true, matched: false };

      if (!normalized.config) {
        await client.query(
          `UPDATE email_webhook_events
           SET processing_status = 'ignored', processed_at = CURRENT_TIMESTAMP
           WHERE svix_id = $1`,
          [normalized.deliveryId],
        );
        return { duplicate: false, ignored: true, matched: false };
      }
      return this.applyNormalized(client, normalized);
    });
  }

  async reconcileEvent(
    client: PoolClient,
    deliveryId: string,
  ): Promise<EmailWebhookResult> {
    const claim = await client.query<EmailWebhookClaimRow>(
      `SELECT *
       FROM email_webhook_events
       WHERE svix_id = $1
         AND reconciliation_status = 'processing'
       FOR UPDATE`,
      [deliveryId],
    );
    if (claim.rows.length === 0) {
      throw new Error('Email reconciliation claim is unavailable');
    }
    const normalized = normalizedEmailWebhookFromClaim(claim.rows[0]);
    const result = await this.applyNormalized(client, normalized, {
      reconciliation: true,
    });
    if (result.pending) {
      const error = new Error(
        'Email provider event mapping is not uniquely resolvable',
      );
      (error as Error & { code?: string }).code = 'RECONCILIATION_UNRESOLVED';
      throw error;
    }
    return result;
  }

  private async applyNormalized(
    client: PoolClient,
    normalized: NormalizedEvent,
    options: { reconciliation?: boolean } = {},
  ): Promise<EmailWebhookResult> {
    const targets = await this.loadTargets(client, normalized.externalId);
    if (targets.organizationCount === 0) {
      return this.markPending(client, normalized, 'unmatched');
    }
    if (targets.organizationCount > 1) {
      return this.markPending(client, normalized, 'ambiguous');
    }

    const emailLog = await this.updateEmailLog(
      client,
      targets.emailLog,
      normalized,
    );
    const campaignRecipient = await this.updateCampaignRecipient(
      client,
      targets.campaignRecipient,
      normalized,
    );
    const matched = Boolean(emailLog || campaignRecipient);

    if (
      matched &&
      shouldSuppressContact(normalized.eventType, normalized.details)
    ) {
      const contactIds = [
        ...new Set(
          [emailLog?.contact_id, campaignRecipient?.contact_id].filter(
            Boolean,
          ),
        ),
      ];
      if (contactIds.length > 0) {
        const isComplaint = normalized.eventType === 'email.complained';
        const bounceType =
          normalized.details.bounceType ||
          normalized.details.suppressionType ||
          normalized.eventType.replace('email.', '');
        await client.query(
          `UPDATE contacts SET
             email_unsubscribed = CASE WHEN $3 THEN TRUE ELSE email_unsubscribed END,
             email_unsubscribed_at = CASE
               WHEN $3 THEN COALESCE(email_unsubscribed_at, $2::timestamptz)
               ELSE email_unsubscribed_at
             END,
             email_bounced = CASE WHEN $3 THEN email_bounced ELSE TRUE END,
             email_bounced_at = CASE
               WHEN $3 THEN email_bounced_at
               ELSE COALESCE(email_bounced_at, $2::timestamptz)
             END,
             email_bounce_type = CASE WHEN $3 THEN email_bounce_type ELSE $4 END
           WHERE id = ANY($1::int[])`,
          [
            contactIds,
            normalized.eventCreatedAt.toISOString(),
            isComplaint,
            boundedText(bounceType, 50),
          ],
        );
      }
    }

    await client.query(
      `UPDATE email_webhook_events SET
         processing_status = $2::varchar,
         matched_email_log_id = $3,
         matched_campaign_recipient_id = $4,
         processed_at = CASE WHEN $2::text = 'processed' THEN CURRENT_TIMESTAMP ELSE NULL END,
         reconciliation_status = CASE WHEN $5 THEN 'resolved' ELSE reconciliation_status END,
         reconciliation_reason = CASE WHEN $5 THEN NULL ELSE reconciliation_reason END,
         reconciliation_next_attempt_at = CASE WHEN $5 THEN NULL ELSE reconciliation_next_attempt_at END,
         reconciliation_lease_expires_at = CASE WHEN $5 THEN NULL ELSE reconciliation_lease_expires_at END,
         reconciliation_last_error = CASE WHEN $5 THEN NULL ELSE reconciliation_last_error END,
         reconciled_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE reconciled_at END
       WHERE svix_id = $1`,
      [
        normalized.deliveryId,
        matched ? 'processed' : 'pending',
        emailLog?.id || null,
        campaignRecipient?.id || null,
        options.reconciliation === true,
      ],
    );

    return { duplicate: false, matched, pending: !matched };
  }

  private async markPending(
    client: PoolClient,
    normalized: NormalizedEvent,
    reason: string,
  ): Promise<EmailWebhookResult> {
    await client.query(
      `UPDATE email_webhook_events SET
         processing_status = 'pending',
         reconciliation_status = 'pending',
         reconciliation_reason = $2,
         reconciliation_next_attempt_at = CURRENT_TIMESTAMP,
         processed_at = NULL
       WHERE svix_id = $1`,
      [normalized.deliveryId, reason],
    );
    return { duplicate: false, matched: false, pending: true, reason };
  }

  private async loadTargets(
    client: PoolClient,
    externalId: string,
  ): Promise<{
    campaignRecipient: TargetRow | null;
    emailLog: TargetRow | null;
    organizationCount: number;
  }> {
    const emailLogResult = await client.query<TargetRow>(
      `SELECT id, organization_id, contact_id, status, provider_status_at
       FROM email_logs
       WHERE external_id = $1
       ORDER BY id DESC
       FOR UPDATE`,
      [externalId],
    );
    const campaignResult = await client.query<TargetRow>(
      `SELECT id, organization_id, contact_id, status, provider_status_at
       FROM campaign_recipients
       WHERE external_message_id = $1
       ORDER BY id DESC
       FOR UPDATE`,
      [externalId],
    );
    const organizationIds = new Set(
      [
        ...emailLogResult.rows.map((row) => row.organization_id),
        ...campaignResult.rows.map((row) => row.organization_id),
      ].filter(Boolean),
    );
    return {
      campaignRecipient: campaignResult.rows[0] || null,
      emailLog: emailLogResult.rows[0] || null,
      organizationCount: organizationIds.size,
    };
  }

  private async updateEmailLog(
    client: PoolClient,
    row: TargetRow | null,
    normalized: NormalizedEvent,
  ): Promise<{ id: number; contact_id: number | null } | null> {
    if (!row || !normalized.config) return null;
    const { config, details, eventCreatedAt, eventType } = normalized;
    const nextStatus = config.emailLogStatus || row.status;
    const status = shouldReplaceStatus(
      row.provider_status_at,
      eventCreatedAt,
      row.status,
      nextStatus,
    )
      ? nextStatus
      : row.status;
    const errorMessage = details.message || null;

    const result = await client.query<{ id: number; contact_id: number | null }>(
      `UPDATE email_logs SET
         status = $2,
         provider_status_at = GREATEST(COALESCE(provider_status_at, '-infinity'::timestamptz), $3::timestamptz),
         sent_at = CASE WHEN $4 THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END,
         delivered_at = CASE WHEN $5 THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
         opened_at = CASE WHEN $6 THEN COALESCE(opened_at, $3::timestamptz) ELSE opened_at END,
         clicked_at = CASE WHEN $7 THEN COALESCE(clicked_at, $3::timestamptz) ELSE clicked_at END,
         bounced_at = CASE WHEN $8 THEN COALESCE(bounced_at, $3::timestamptz) ELSE bounced_at END,
         unsubscribed_at = CASE WHEN $9 THEN COALESCE(unsubscribed_at, $3::timestamptz) ELSE unsubscribed_at END,
         error_message = CASE WHEN $10::text IS NOT NULL THEN $10 ELSE error_message END,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_provider_event', $11::text)
       WHERE id = $1
       RETURNING id, organization_id, contact_id`,
      [
        row.id,
        status,
        eventCreatedAt.toISOString(),
        Boolean(config.sent),
        Boolean(config.delivered),
        Boolean(config.opened),
        Boolean(config.clicked),
        Boolean(config.bounced),
        Boolean(config.unsubscribed),
        errorMessage,
        eventType,
      ],
    );
    return result.rows[0] || null;
  }

  private async updateCampaignRecipient(
    client: PoolClient,
    row: TargetRow | null,
    normalized: NormalizedEvent,
  ): Promise<{ id: number; contact_id: number | null } | null> {
    if (!row || !normalized.config) return null;
    const { config, details, eventCreatedAt, eventType } = normalized;
    const nextStatus = config.campaignStatus || row.status;
    const status = shouldReplaceStatus(
      row.provider_status_at,
      eventCreatedAt,
      row.status,
      nextStatus,
    )
      ? nextStatus
      : row.status;
    const link = details.link ? JSON.stringify([details.link]) : '[]';

    const result = await client.query<{ id: number; contact_id: number | null }>(
      `UPDATE campaign_recipients SET
         status = $2,
         provider_status_at = GREATEST(COALESCE(provider_status_at, '-infinity'::timestamptz), $3::timestamptz),
         sent_at = CASE WHEN $4 THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END,
         delivered_at = CASE WHEN $5 THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
         opened_at = CASE WHEN $6 THEN COALESCE(opened_at, $3::timestamptz) ELSE opened_at END,
         clicked_at = CASE WHEN $7 THEN COALESCE(clicked_at, $3::timestamptz) ELSE clicked_at END,
         bounced_at = CASE WHEN $8 THEN COALESCE(bounced_at, $3::timestamptz) ELSE bounced_at END,
         unsubscribed_at = CASE WHEN $9 THEN COALESCE(unsubscribed_at, $3::timestamptz) ELSE unsubscribed_at END,
         open_count = open_count + CASE WHEN $6 THEN 1 ELSE 0 END,
         click_count = click_count + CASE WHEN $7 THEN 1 ELSE 0 END,
         clicked_links = CASE WHEN $7 THEN COALESCE(clicked_links, '[]'::jsonb) || $10::jsonb ELSE clicked_links END,
         error_message = CASE WHEN $11::text IS NOT NULL THEN $11 ELSE error_message END,
         bounce_type = CASE WHEN $12::text IS NOT NULL THEN $12 ELSE bounce_type END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, organization_id, contact_id`,
      [
        row.id,
        status,
        eventCreatedAt.toISOString(),
        Boolean(config.sent),
        Boolean(config.delivered),
        Boolean(config.opened),
        Boolean(config.clicked),
        Boolean(config.bounced),
        Boolean(config.unsubscribed),
        link,
        details.message || null,
        details.bounceType ||
          details.suppressionType ||
          (eventType === 'email.complained' ? 'complained' : null),
      ],
    );
    return result.rows[0] || null;
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
