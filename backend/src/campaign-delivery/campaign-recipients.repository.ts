import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CampaignRecipientRow = {
  id: number; campaign_id: number; contact_id: number; organization_id: number;
  email: string; first_name: string | null; last_name: string | null; status: string;
  sent_at: Date | null; delivered_at: Date | null; opened_at: Date | null;
  clicked_at: Date | null; bounced_at: Date | null; unsubscribed_at: Date | null;
  open_count: number; click_count: number; clicked_links: unknown;
  error_message: string | null; bounce_type: string | null; email_log_id: number | null;
  external_message_id: string | null; ab_variant: string | null;
  created_at: Date; updated_at: Date;
  contact_first_name: string | null; contact_last_name: string | null;
};

@Injectable()
export class CampaignRecipientsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(criteria: {
    organizationId: number; campaignId: number; status?: string; pageSize: number; offset: number;
  }): Promise<{ kind: 'not_found' } | { kind: 'ok'; rows: CampaignRecipientRow[]; total: string }> {
    const campaign = await this.pool.query(
      'SELECT 1 FROM email_campaigns WHERE id=$1 AND organization_id=$2',
      [criteria.campaignId, criteria.organizationId],
    );
    if (!campaign.rows[0]) return { kind: 'not_found' };

    const parameters: unknown[] = [criteria.campaignId, criteria.organizationId];
    const clauses = ['cr.campaign_id=$1', 'cr.organization_id=$2'];
    if (criteria.status !== undefined) {
      parameters.push(criteria.status);
      clauses.push(`cr.status=$${parameters.length}`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM campaign_recipients cr WHERE ${where}`,
      parameters,
    );
    parameters.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<CampaignRecipientRow>(
      `SELECT cr.id, cr.campaign_id, cr.contact_id, cr.organization_id, cr.email,
         cr.first_name, cr.last_name, cr.status, cr.sent_at, cr.delivered_at,
         cr.opened_at, cr.clicked_at, cr.bounced_at, cr.unsubscribed_at,
         cr.open_count, cr.click_count, cr.clicked_links, cr.error_message,
         cr.bounce_type, cr.email_log_id, cr.external_message_id, cr.ab_variant,
         cr.created_at, cr.updated_at, c.first_name AS contact_first_name,
         c.last_name AS contact_last_name
       FROM campaign_recipients cr
       LEFT JOIN contacts c ON c.id=cr.contact_id AND c.organization_id=cr.organization_id
       WHERE ${where}
       ORDER BY cr.sent_at DESC NULLS LAST, cr.id DESC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return { kind: 'ok', rows: rows.rows, total: count.rows[0]?.total ?? '0' };
  }
}
