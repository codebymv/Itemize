import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CampaignUnsubscribeClaims } from './campaign-unsubscribe.token';

export type CampaignUnsubscribeRecipient = CampaignUnsubscribeClaims & {
  alreadyUnsubscribed: boolean;
};

@Injectable()
export class CampaignUnsubscribeRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(recipientId: number): Promise<CampaignUnsubscribeRecipient | null> {
    const result = await this.pool.query<{
      id: number;
      organization_id: number;
      campaign_id: number;
      email: string;
      unsubscribed_at: Date | null;
    }>(
      `SELECT id, organization_id, campaign_id, email, unsubscribed_at
       FROM campaign_recipients WHERE id=$1`,
      [recipientId],
    );
    const row = result.rows[0];
    return row ? {
      recipientId: Number(row.id),
      organizationId: Number(row.organization_id),
      campaignId: Number(row.campaign_id),
      email: row.email,
      alreadyUnsubscribed: row.unsubscribed_at !== null,
    } : null;
  }

  async unsubscribe(claims: CampaignUnsubscribeClaims): Promise<boolean> {
    return this.transaction(async (client) => {
      const recipient = await client.query<{
        contact_id: number;
        delivery_status: string;
      }>(
        `SELECT contact_id, delivery_status
         FROM campaign_recipients
         WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 AND email=$4
         FOR UPDATE`,
        [claims.recipientId, claims.organizationId, claims.campaignId, claims.email],
      );
      const row = recipient.rows[0];
      if (!row) return false;

      await client.query(
        `UPDATE contacts SET email_unsubscribed=TRUE,
           email_unsubscribed_at=COALESCE(email_unsubscribed_at,CURRENT_TIMESTAMP),
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [row.contact_id, claims.organizationId],
      );
      await client.query(
        `UPDATE campaign_recipients SET status='unsubscribed',
           unsubscribed_at=COALESCE(unsubscribed_at,CURRENT_TIMESTAMP),
           delivery_status=CASE
             WHEN delivery_status IN ('queued','retry') THEN 'suppressed'
             ELSE delivery_status
           END,
           suppression_reason=CASE
             WHEN delivery_status IN ('queued','retry') THEN 'unsubscribed'
             ELSE suppression_reason
           END,
           suppressed_at=CASE
             WHEN delivery_status IN ('queued','retry') THEN COALESCE(suppressed_at,CURRENT_TIMESTAMP)
             ELSE suppressed_at
           END,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [claims.recipientId, claims.organizationId],
      );
      await client.query(
        `UPDATE email_campaigns SET total_unsubscribed=(
           SELECT COUNT(*)::int FROM campaign_recipients
           WHERE campaign_id=$1 AND organization_id=$2 AND status='unsubscribed'
         ), updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [claims.campaignId, claims.organizationId],
      );
      return true;
    });
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
