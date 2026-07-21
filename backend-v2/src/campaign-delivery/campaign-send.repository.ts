import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { compileCampaignAudience } from '../campaigns/audience.compiler';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { PG_POOL } from '../database/database.module';

export type CampaignDeliveryPayload = {
  subject: string;
  html: string;
  text: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
};

type RecipientSnapshot = {
  id: number; email: string; first_name: string | null; last_name: string | null;
};

export type CampaignSendPreparation =
  | { kind: 'created' | 'replayed'; campaignId: number; jobId: number; recipientCount: number }
  | { kind: 'not_found' }
  | { kind: 'invalid_status'; status: string }
  | { kind: 'no_recipients' }
  | { kind: 'subscription_unavailable' }
  | { kind: 'usage_exceeded'; limit: number; current: number; requested: number }
  | { kind: 'key_conflict' };

export type ClaimedCampaignRecipient = {
  id: number; organization_id: number; campaign_id: number; delivery_job_id: number;
  email: string; first_name: string | null; last_name: string | null;
  delivery_attempt_count: number; payload: CampaignDeliveryPayload;
};

export type CampaignLifecycleOutcome =
  | { kind: 'ok'; pendingRecipients: number }
  | { kind: 'completed'; pendingRecipients: 0 }
  | { kind: 'not_found' }
  | { kind: 'invalid_status'; status: string }
  | { kind: 'delivery_unavailable' };

@Injectable()
export class CampaignSendRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly campaigns: CampaignsRepository,
  ) {}

  async prepare(
    organizationId: number,
    userId: number,
    campaignId: number,
    idempotencyKey: string,
  ): Promise<CampaignSendPreparation> {
    return this.transaction(async (client) => {
      const campaignResult = await client.query<{
        id: number; organization_id: number; status: string; subject: string;
        from_name: string | null; from_email: string | null; reply_to: string | null;
        content_html: string | null; content_text: string | null;
        template_html: string | null; template_text: string | null;
        segment_type: string; segment_id: number | null; segment_filter: unknown;
        tag_ids: number[] | null; excluded_tag_ids: number[] | null;
      }>(
        `SELECT c.id, c.organization_id, c.status, c.subject, c.from_name, c.from_email,
                c.reply_to, c.content_html, c.content_text, c.segment_type, c.segment_id,
                c.segment_filter, c.tag_ids, c.excluded_tag_ids,
                et.body_html AS template_html, et.body_text AS template_text
         FROM email_campaigns c
         LEFT JOIN email_templates et
           ON et.id=c.template_id AND et.organization_id=c.organization_id
         WHERE c.id=$1 AND c.organization_id=$2
         FOR UPDATE OF c`,
        [campaignId, organizationId],
      );
      const campaign = campaignResult.rows[0];
      if (!campaign) return { kind: 'not_found' };

      const existing = await client.query<{ id: number; campaign_id: number; recipient_count: number }>(
        `SELECT id, campaign_id, recipient_count FROM campaign_delivery_jobs
         WHERE organization_id=$1 AND idempotency_key=$2`,
        [organizationId, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (Number(existing.rows[0].campaign_id) !== campaignId) return { kind: 'key_conflict' };
        return {
          kind: 'replayed', campaignId, jobId: Number(existing.rows[0].id),
          recipientCount: Number(existing.rows[0].recipient_count),
        };
      }
      if (!['draft', 'scheduled'].includes(campaign.status)) {
        return { kind: 'invalid_status', status: campaign.status };
      }

      const audience = await this.campaigns.normalizeStoredAudience(
        client, organizationId, campaign as never,
      );
      const compiled = compileCampaignAudience(audience, { alias: 'c', startIndex: 2 });
      const recipientResult = await client.query<RecipientSnapshot>(
        `SELECT DISTINCT ON (c.email) c.id, c.email, c.first_name, c.last_name
         FROM contacts c
         WHERE c.organization_id=$1
           AND c.email IS NOT NULL AND c.email != ''
           AND COALESCE(c.email_unsubscribed,FALSE)=FALSE
           AND COALESCE(c.email_bounced,FALSE)=FALSE
           AND ${compiled.condition}
         ORDER BY c.email, c.id`,
        [organizationId, ...compiled.params],
      );
      const recipients = recipientResult.rows;
      if (recipients.length === 0) return { kind: 'no_recipients' };

      const subscription = await client.query<{ limit_value: string | null }>(
        `SELECT sp.limits->>'emails_per_month' AS limit_value
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id=s.plan_id AND sp.is_active=TRUE
         WHERE s.organization_id=$1 AND s.status IN ('active','trialing')
         FOR UPDATE OF s`,
        [organizationId],
      );
      const rawLimit = subscription.rows[0]?.limit_value;
      const limit = rawLimit === null || rawLimit === undefined ? NaN : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < -1) return { kind: 'subscription_unavailable' };

      const usage = await client.query<{ count: number }>(
        `INSERT INTO usage_tracking (
           organization_id, resource_type, period_start, period_end, count, limit_value
         ) VALUES (
           $1, 'emails_per_month', date_trunc('month',CURRENT_TIMESTAMP)::date,
           (date_trunc('month',CURRENT_TIMESTAMP) + INTERVAL '1 month - 1 day')::date,
           0, $2
         ) ON CONFLICT (organization_id, resource_type, period_start)
           DO UPDATE SET limit_value=EXCLUDED.limit_value, updated_at=CURRENT_TIMESTAMP
         RETURNING count`,
        [organizationId, limit],
      );
      const current = Number(usage.rows[0]?.count);
      if (!Number.isSafeInteger(current) || current < 0) throw new Error('Unsafe email usage count');
      if (limit !== -1 && current + recipients.length > limit) {
        return { kind: 'usage_exceeded', limit, current, requested: recipients.length };
      }

      const payload: CampaignDeliveryPayload = {
        subject: campaign.subject,
        html: campaign.content_html ?? campaign.template_html ?? '',
        text: campaign.content_text ?? campaign.template_text,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
        replyTo: campaign.reply_to,
      };
      const job = await client.query<{ id: number }>(
        `INSERT INTO campaign_delivery_jobs (
           organization_id, campaign_id, requested_by_user_id, idempotency_key,
           payload, recipient_count
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,
        [organizationId, campaignId, userId, idempotencyKey,
          JSON.stringify(payload), recipients.length],
      );
      const jobId = Number(job.rows[0].id);

      await client.query('DELETE FROM campaign_recipients WHERE campaign_id=$1', [campaignId]);
      const snapshot = JSON.stringify(recipients.map((recipient) => ({
        contactId: Number(recipient.id), email: recipient.email,
        firstName: recipient.first_name, lastName: recipient.last_name,
      })));
      const inserted = await client.query<{ count: number }>(
        `WITH snapshots AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS value(
             "contactId" int, email text, "firstName" text, "lastName" text
           )
         ), inserted AS (
           INSERT INTO campaign_recipients (
             campaign_id, contact_id, organization_id, email, first_name, last_name,
             delivery_job_id, delivery_status
           )
           SELECT $2, "contactId", $3, email, "firstName", "lastName", $4, 'queued'
           FROM snapshots
           RETURNING id
         ) SELECT COUNT(*)::int AS count FROM inserted`,
        [snapshot, campaignId, organizationId, jobId],
      );
      if (Number(inserted.rows[0]?.count) !== recipients.length) {
        throw new Error('Campaign recipient snapshot was incomplete');
      }
      await client.query(
        `UPDATE usage_tracking SET count=count+$2, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND resource_type='emails_per_month'
           AND period_start=date_trunc('month',CURRENT_TIMESTAMP)::date`,
        [organizationId, recipients.length],
      );
      await client.query(
        `UPDATE email_campaigns SET status='sending', started_at=CURRENT_TIMESTAMP,
           completed_at=NULL, sent_by=$1, total_recipients=$2, total_sent=0,
           updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND organization_id=$4`,
        [userId, recipients.length, campaignId, organizationId],
      );
      return { kind: 'created', campaignId, jobId, recipientCount: recipients.length };
    });
  }

  async due(limit: number): Promise<Array<{ id: number; organizationId: number }>> {
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT recipient.id, recipient.organization_id
       FROM campaign_recipients recipient
       JOIN email_campaigns campaign
         ON campaign.id=recipient.campaign_id
        AND campaign.organization_id=recipient.organization_id
       WHERE campaign.status='sending' AND recipient.delivery_job_id IS NOT NULL AND (
         (recipient.delivery_status IN ('queued','retry')
           AND recipient.delivery_next_attempt_at <= CURRENT_TIMESTAMP)
         OR (recipient.delivery_status='processing'
           AND recipient.delivery_lease_expires_at <= CURRENT_TIMESTAMP)
       ) ORDER BY recipient.delivery_next_attempt_at, recipient.id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({ id: Number(row.id), organizationId: Number(row.organization_id) }));
  }

  async pause(organizationId: number, campaignId: number): Promise<CampaignLifecycleOutcome> {
    return this.transaction(async (client) => {
      const campaign = await client.query<{ status: string }>(
        `SELECT status FROM email_campaigns
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [campaignId, organizationId],
      );
      if (!campaign.rows[0]) return { kind: 'not_found' };
      if (campaign.rows[0].status !== 'sending') {
        return { kind: 'invalid_status', status: campaign.rows[0].status };
      }
      await client.query(
        `UPDATE email_campaigns SET status='paused', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [campaignId, organizationId],
      );
      const pending = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int count FROM campaign_recipients
         WHERE campaign_id=$1 AND organization_id=$2 AND delivery_job_id IS NOT NULL
           AND delivery_status IN ('queued','processing','retry')`,
        [campaignId, organizationId],
      );
      return { kind: 'ok', pendingRecipients: Number(pending.rows[0]?.count ?? 0) };
    });
  }

  async resume(organizationId: number, campaignId: number): Promise<CampaignLifecycleOutcome> {
    return this.transaction(async (client) => {
      const campaign = await client.query<{ status: string }>(
        `SELECT status FROM email_campaigns
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [campaignId, organizationId],
      );
      if (!campaign.rows[0]) return { kind: 'not_found' };
      if (campaign.rows[0].status !== 'paused') {
        return { kind: 'invalid_status', status: campaign.rows[0].status };
      }
      const delivery = await client.query<{ id: number }>(
        `SELECT id FROM campaign_delivery_jobs
         WHERE organization_id=$1 AND campaign_id=$2
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [organizationId, campaignId],
      );
      if (!delivery.rows[0]) return { kind: 'delivery_unavailable' };
      const job = await client.query<{ active: number; sent: number; ambiguous: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE delivery_status IN ('queued','processing','retry'))::int active,
           COUNT(*) FILTER (WHERE delivery_status='sent')::int sent,
           COUNT(*) FILTER (WHERE delivery_status='reconciliation_required')::int ambiguous
         FROM campaign_recipients WHERE delivery_job_id=$1`,
        [delivery.rows[0].id],
      );
      const counts = job.rows[0];
      const active = Number(counts.active);
      if (!Number.isSafeInteger(active) || active < 0) throw new Error('Unsafe pending recipient count');
      if (active === 0) {
        const ambiguous = Number(counts.ambiguous) > 0;
        await client.query(
          `UPDATE campaign_delivery_jobs SET status=$2,
             completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
           WHERE id=$1`,
          [delivery.rows[0].id, ambiguous ? 'reconciliation_required' : 'completed'],
        );
        await client.query(
          `UPDATE email_campaigns SET status=$3, total_sent=$4,
             completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND organization_id=$2`,
          [campaignId, organizationId, ambiguous ? 'failed' : 'sent', Number(counts.sent)],
        );
        return { kind: 'completed', pendingRecipients: 0 };
      }
      await client.query(
        `UPDATE email_campaigns SET status='sending', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [campaignId, organizationId],
      );
      return { kind: 'ok', pendingRecipients: active };
    });
  }

  async claim(organizationId: number, recipientId: number): Promise<ClaimedCampaignRecipient | null> {
    const result = await this.pool.query<ClaimedCampaignRecipient>(
      `UPDATE campaign_recipients recipient SET
         delivery_status='processing', delivery_attempt_count=delivery_attempt_count+1,
         delivery_lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '30 seconds',
         delivery_claimed_by=$3, updated_at=CURRENT_TIMESTAMP
       FROM campaign_delivery_jobs job, email_campaigns campaign
       WHERE recipient.id=$1 AND recipient.organization_id=$2
         AND job.id=recipient.delivery_job_id
         AND campaign.id=recipient.campaign_id AND campaign.organization_id=recipient.organization_id
         AND campaign.status='sending' AND (
           (recipient.delivery_status IN ('queued','retry')
             AND recipient.delivery_next_attempt_at <= CURRENT_TIMESTAMP)
           OR (recipient.delivery_status='processing'
             AND recipient.delivery_lease_expires_at <= CURRENT_TIMESTAMP)
         )
       RETURNING recipient.id, recipient.organization_id, recipient.campaign_id,
         recipient.delivery_job_id, recipient.email, recipient.first_name, recipient.last_name,
         recipient.delivery_attempt_count, job.payload`,
      [recipientId, organizationId, `nest:${process.pid}`],
    );
    if (result.rows[0]) {
      await this.pool.query(
        `UPDATE campaign_delivery_jobs SET status='processing', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND status='queued'`,
        [result.rows[0].delivery_job_id],
      );
    }
    return result.rows[0] ?? null;
  }

  async complete(
    organizationId: number, recipientId: number, providerId: string | null,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query<{ delivery_job_id: number }>(
        `UPDATE campaign_recipients SET delivery_status='sent', status='sent',
           external_message_id=$3, sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),
           error_message=NULL, delivery_lease_expires_at=NULL, delivery_claimed_by=NULL,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND delivery_status='processing'
         RETURNING delivery_job_id`,
        [recipientId, organizationId, providerId],
      );
      if (!updated.rows[0]) return;
      await this.finalize(client, Number(updated.rows[0].delivery_job_id));
    });
  }

  async fail(
    organizationId: number, recipientId: number, error: string, ambiguous: boolean,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query<{ delivery_job_id: number }>(
        `UPDATE campaign_recipients SET
           delivery_status=CASE WHEN $3::boolean THEN 'reconciliation_required'
             WHEN delivery_attempt_count >= 5 THEN 'dead_letter' ELSE 'retry' END,
           status=CASE WHEN NOT $3::boolean AND delivery_attempt_count >= 5
             THEN 'failed' ELSE status END,
           delivery_next_attempt_at=CURRENT_TIMESTAMP +
             (LEAST(300,POWER(2,GREATEST(delivery_attempt_count-1))) * INTERVAL '1 second'),
           error_message=LEFT($4,2000), delivery_lease_expires_at=NULL,
           delivery_claimed_by=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND delivery_status='processing'
         RETURNING delivery_job_id`,
        [recipientId, organizationId, ambiguous, error],
      );
      if (!updated.rows[0]) return;
      await this.finalize(client, Number(updated.rows[0].delivery_job_id));
    });
  }

  private async finalize(client: PoolClient, jobId: number): Promise<void> {
    const counts = await client.query<{
      campaign_id: number; active: number; sent: number; ambiguous: number;
    }>(
      `SELECT job.campaign_id,
         COUNT(*) FILTER (WHERE recipient.delivery_status IN ('queued','processing','retry'))::int active,
         COUNT(*) FILTER (WHERE recipient.delivery_status='sent')::int sent,
         COUNT(*) FILTER (WHERE recipient.delivery_status='reconciliation_required')::int ambiguous
       FROM campaign_delivery_jobs job
       JOIN campaign_recipients recipient ON recipient.delivery_job_id=job.id
       WHERE job.id=$1 GROUP BY job.campaign_id`,
      [jobId],
    );
    const row = counts.rows[0];
    if (!row) throw new Error('Campaign delivery job has no recipients');
    await client.query(
      `UPDATE email_campaigns SET total_sent=$2, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [row.campaign_id, row.sent],
    );
    if (Number(row.active) > 0) return;
    const ambiguous = Number(row.ambiguous) > 0;
    await client.query(
      `UPDATE campaign_delivery_jobs SET status=$2,
         completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [jobId, ambiguous ? 'reconciliation_required' : 'completed'],
    );
    await client.query(
      `UPDATE email_campaigns SET status=$2, total_sent=$3,
         completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [row.campaign_id, ambiguous ? 'failed' : 'sent', row.sent],
    );
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
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
