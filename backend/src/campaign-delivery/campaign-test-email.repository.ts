import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CampaignTestEmailPayload = {
  html: string;
  text: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
};

export type CampaignTestEmailDeliveryRow = {
  id: number; organization_id: number; campaign_id: number;
  requested_by_user_id: number | null; idempotency_key: string;
  recipient_email: string; subject: string; payload: CampaignTestEmailPayload;
  status: string; attempt_count: number; next_attempt_at: Date;
  lease_expires_at: Date | null; claimed_by: string | null;
  provider_id: string | null; last_error: string | null; sent_at: Date | null;
  created_at: Date; updated_at: Date;
};

export type CampaignTestEmailPreparation =
  | { kind: 'created' | 'replayed'; delivery: CampaignTestEmailDeliveryRow }
  | { kind: 'not_found' }
  | { kind: 'key_conflict' };

const substitute = (value: string | null, data: Record<string, string>): string | null => {
  if (value === null) return null;
  let result = value;
  for (const [key, replacement] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), replacement);
  }
  return result;
};

@Injectable()
export class CampaignTestEmailRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async prepare(
    organizationId: number,
    userId: number,
    campaignId: number,
    recipientEmail: string,
    idempotencyKey: string,
  ): Promise<CampaignTestEmailPreparation> {
    return this.transaction(async (client) => {
      const campaignResult = await client.query<{
        subject: string; from_name: string | null; from_email: string | null;
        reply_to: string | null; content_html: string | null; content_text: string | null;
        template_html: string | null; template_text: string | null;
      }>(
        `SELECT c.subject, c.from_name, c.from_email, c.reply_to,
                c.content_html, c.content_text,
                et.body_html AS template_html, et.body_text AS template_text
         FROM email_campaigns c
         LEFT JOIN email_templates et
           ON et.id = c.template_id AND et.organization_id = c.organization_id
         WHERE c.id = $1 AND c.organization_id = $2
         FOR UPDATE OF c`,
        [campaignId, organizationId],
      );
      const campaign = campaignResult.rows[0];
      if (!campaign) return { kind: 'not_found' };
      const existing = await client.query<CampaignTestEmailDeliveryRow>(
        `SELECT * FROM campaign_test_email_deliveries
         WHERE organization_id=$1 AND campaign_id=$2 AND idempotency_key=$3`,
        [organizationId, campaignId, idempotencyKey],
      );
      if (existing.rows[0]) {
        return existing.rows[0].recipient_email === recipientEmail
          ? { kind: 'replayed', delivery: existing.rows[0] }
          : { kind: 'key_conflict' };
      }
      const data = {
        first_name: 'Test', last_name: 'User', email: recipientEmail,
        company: 'Test Company',
      };
      const payload: CampaignTestEmailPayload = {
        html: substitute(campaign.content_html ?? campaign.template_html ?? '', data) ?? '',
        text: substitute(campaign.content_text ?? campaign.template_text, data),
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
        replyTo: campaign.reply_to,
      };
      const subject = `[TEST] ${campaign.subject}`.slice(0, 255);
      const inserted = await client.query<CampaignTestEmailDeliveryRow>(
        `INSERT INTO campaign_test_email_deliveries (
           organization_id, campaign_id, requested_by_user_id, idempotency_key,
           recipient_email, subject, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING *`,
        [organizationId, campaignId, userId, idempotencyKey, recipientEmail,
          subject, JSON.stringify(payload)],
      );
      return { kind: 'created', delivery: inserted.rows[0] };
    });
  }

  async find(organizationId: number, deliveryId: number): Promise<CampaignTestEmailDeliveryRow | null> {
    const result = await this.pool.query<CampaignTestEmailDeliveryRow>(
      'SELECT * FROM campaign_test_email_deliveries WHERE id=$1 AND organization_id=$2',
      [deliveryId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async due(limit: number): Promise<Array<{ id: number; organizationId: number }>> {
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id FROM campaign_test_email_deliveries
       WHERE (status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at, id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({ id: Number(row.id), organizationId: Number(row.organization_id) }));
  }

  async claim(organizationId: number, deliveryId: number): Promise<CampaignTestEmailDeliveryRow | null> {
    const result = await this.pool.query<CampaignTestEmailDeliveryRow>(
      `UPDATE campaign_test_email_deliveries
       SET status='processing', attempt_count=attempt_count+1,
           lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '30 seconds',
           claimed_by=$3, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND organization_id=$2 AND (
         (status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
         OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ) RETURNING *`,
      [deliveryId, organizationId, `nest:${process.pid}`],
    );
    return result.rows[0] ?? null;
  }

  async complete(
    organizationId: number,
    deliveryId: number,
    providerId: string | null,
  ): Promise<CampaignTestEmailDeliveryRow> {
    const result = await this.pool.query<CampaignTestEmailDeliveryRow>(
      `UPDATE campaign_test_email_deliveries
       SET status='sent', provider_id=$3, sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),
           lease_expires_at=NULL, claimed_by=NULL, last_error=NULL,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND organization_id=$2 RETURNING *`,
      [deliveryId, organizationId, providerId],
    );
    if (!result.rows[0]) throw new Error('Campaign test email delivery not found');
    return result.rows[0];
  }

  async fail(
    organizationId: number,
    deliveryId: number,
    error: string,
    ambiguous: boolean,
  ): Promise<CampaignTestEmailDeliveryRow> {
    const result = await this.pool.query<CampaignTestEmailDeliveryRow>(
      `UPDATE campaign_test_email_deliveries
       SET status=CASE WHEN $3::boolean THEN 'reconciliation_required'
                       WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'retry' END,
           next_attempt_at=CURRENT_TIMESTAMP +
             (LEAST(300, POWER(2, GREATEST(attempt_count-1))) * INTERVAL '1 second'),
           last_error=LEFT($4,2000), lease_expires_at=NULL, claimed_by=NULL,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND organization_id=$2 RETURNING *`,
      [deliveryId, organizationId, ambiguous, error],
    );
    if (!result.rows[0]) throw new Error('Campaign test email delivery not found');
    return result.rows[0];
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
