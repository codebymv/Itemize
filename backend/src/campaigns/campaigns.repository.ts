import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  AudienceValidationError,
  CampaignAudience,
  CONTACT_STATUSES,
  SegmentRow,
  compileCampaignAudience,
  compileSegmentCondition,
} from './audience.compiler';

export type CampaignRow = {
  id: number; organization_id: number; name: string; subject: string;
  from_name: string | null; from_email: string | null; reply_to: string | null;
  template_id: number | null; content_html: string | null; content_text: string | null;
  segment_type: string; segment_id: number | null; segment_filter: unknown;
  tag_ids: number[] | null; excluded_tag_ids: number[] | null; status: string;
  scheduled_at: Date | null; send_immediately: boolean | null; timezone: string | null;
  is_ab_test: boolean | null; ab_variants: unknown | null; ab_winner_criteria: string | null;
  ab_test_duration_hours: number | null; total_recipients: number; total_sent: number;
  total_delivered: number; total_opened: number; total_clicked: number; total_bounced: number;
  total_unsubscribed: number; total_complained: number; open_rate: string | number;
  click_rate: string | number; bounce_rate: string | number; created_by: number | null;
  sent_by: number | null; started_at: Date | null; completed_at: Date | null;
  created_at: Date; updated_at: Date; template_name?: string | null;
  template_html?: string | null; created_by_name?: string | null; sent_by_name?: string | null;
};

export type CampaignLinkRow = {
  id: number; campaign_id: number; original_url: string; tracking_url: string | null;
  link_text: string | null; link_position: number | null; total_clicks: number;
  unique_clicks: number; created_at: Date;
};

export type AudienceValues = {
  segmentType: string; segmentId: number | null; segmentFilter: Record<string, unknown>;
  tagIds: number[]; excludedTagIds: number[];
};

export type CampaignValues = AudienceValues & {
  name: string; subject: string; fromName: string | null; fromEmail: string | null;
  replyTo: string | null; templateId: number | null; contentHtml: string | null;
  contentText: string | null;
};

export type CampaignUpdates = Partial<CampaignValues>;
export type RepositoryOutcome = { kind: 'ok'; row: CampaignRow } | { kind: 'not_found' } | { kind: 'invalid_status'; status: string };
export type CampaignAudiencePreviewRow = {
  recipientCount: number; segmentType: string; segmentId: number | null;
  tagIds: number[]; excludedTagIds: number[];
};

export class CampaignValidationError extends Error {
  constructor(message: string, readonly field: string) {
    super(message);
    this.name = 'CampaignValidationError';
  }
}

const campaignColumns = (alias = 'c') => `
  ${alias}.id, ${alias}.organization_id, ${alias}.name, ${alias}.subject,
  ${alias}.from_name, ${alias}.from_email, ${alias}.reply_to, ${alias}.template_id,
  ${alias}.content_html, ${alias}.content_text, ${alias}.segment_type, ${alias}.segment_id,
  ${alias}.segment_filter, ${alias}.tag_ids, ${alias}.excluded_tag_ids, ${alias}.status,
  ${alias}.scheduled_at, ${alias}.send_immediately, ${alias}.timezone, ${alias}.is_ab_test,
  ${alias}.ab_variants, ${alias}.ab_winner_criteria, ${alias}.ab_test_duration_hours,
  ${alias}.total_recipients, ${alias}.total_sent, ${alias}.total_delivered, ${alias}.total_opened,
  ${alias}.total_clicked, ${alias}.total_bounced, ${alias}.total_unsubscribed,
  ${alias}.total_complained, ${alias}.open_rate, ${alias}.click_rate, ${alias}.bounce_rate,
  ${alias}.created_by, ${alias}.sent_by, ${alias}.started_at, ${alias}.completed_at,
  ${alias}.created_at, ${alias}.updated_at`;

const campaignReadColumns = (alias = 'c') => campaignColumns(alias).replace(
  `${alias}.template_id`,
  `CASE WHEN et.id IS NULL THEN NULL ELSE ${alias}.template_id END AS template_id`,
);

@Injectable()
export class CampaignsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(criteria: {
    organizationId: number; status?: string; searchPattern?: string; pageSize: number; offset: number;
  }): Promise<{ rows: CampaignRow[]; total: string }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['c.organization_id = $1'];
    if (criteria.status !== undefined) {
      parameters.push(criteria.status);
      clauses.push(`c.status = $${parameters.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      parameters.push(criteria.searchPattern);
      clauses.push(`(c.name ILIKE $${parameters.length} ESCAPE '\\' OR c.subject ILIKE $${parameters.length} ESCAPE '\\')`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM email_campaigns c WHERE ${where}`,
      parameters,
    );
    parameters.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<CampaignRow>(
      `SELECT ${campaignReadColumns()}, et.name AS template_name, u.name AS created_by_name
       FROM email_campaigns c
       LEFT JOIN email_templates et ON et.id = c.template_id AND et.organization_id = c.organization_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? '0' };
  }

  async findById(organizationId: number, id: number): Promise<{ row: CampaignRow; links: CampaignLinkRow[] } | null> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${campaignReadColumns()}, et.name AS template_name, et.body_html AS template_html,
         u.name AS created_by_name, su.name AS sent_by_name
       FROM email_campaigns c
       LEFT JOIN email_templates et ON et.id = c.template_id AND et.organization_id = c.organization_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users su ON su.id = c.sent_by
       WHERE c.id = $1 AND c.organization_id = $2`,
      [id, organizationId],
    );
    if (!result.rows[0]) return null;
    const links = await this.pool.query<CampaignLinkRow>(
      `SELECT id, campaign_id, original_url, tracking_url, link_text, link_position,
         total_clicks, unique_clicks, created_at
       FROM campaign_links WHERE campaign_id = $1 ORDER BY link_position ASC, id ASC`,
      [id],
    );
    return { row: result.rows[0], links: links.rows };
  }

  async previewAudience(organizationId: number, id: number): Promise<CampaignAudiencePreviewRow | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<CampaignRow>(
        `SELECT ${campaignColumns('email_campaigns')} FROM email_campaigns
         WHERE id=$1 AND organization_id=$2`,
        [id, organizationId],
      );
      const campaign = result.rows[0];
      if (!campaign) return null;
      const audience = await this.normalizeStoredAudience(client, organizationId, campaign);
      const compiled = compileCampaignAudience(audience, { alias: 'c', startIndex: 2 });
      const count = await client.query<{ total: string }>(
        `SELECT COUNT(DISTINCT c.email) AS total
         FROM contacts c
         WHERE c.organization_id=$1
           AND c.email IS NOT NULL AND c.email != ''
           AND (c.email_unsubscribed IS NULL OR c.email_unsubscribed=FALSE)
           AND (c.email_bounced IS NULL OR c.email_bounced=FALSE)
           AND ${compiled.condition}`,
        [organizationId, ...compiled.params],
      );
      const recipientCount = Number(count.rows[0]?.total);
      if (!Number.isSafeInteger(recipientCount) || recipientCount < 0) {
        throw new Error('Unsafe campaign audience count');
      }
      return {
        recipientCount,
        segmentType: audience.segmentType,
        segmentId: audience.segmentId,
        tagIds: audience.tagIds,
        excludedTagIds: audience.excludedTagIds,
      };
    } finally {
      client.release();
    }
  }

  async create(organizationId: number, userId: number, values: CampaignValues): Promise<CampaignRow> {
    return this.transaction(async (client) => {
      await this.validateTemplate(client, organizationId, values.templateId, 'templateId');
      const audience = await this.validateAudience(client, organizationId, values);
      const result = await client.query<CampaignRow>(
        `INSERT INTO email_campaigns (
           organization_id, name, subject, from_name, from_email, reply_to, template_id,
           content_html, content_text, segment_type, segment_id, segment_filter,
           tag_ids, excluded_tag_ids, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
         RETURNING ${campaignColumns('email_campaigns')}`,
        [organizationId, values.name, values.subject, values.fromName, values.fromEmail,
          values.replyTo, values.templateId, values.contentHtml, values.contentText,
          audience.segmentType, audience.segmentId, JSON.stringify(audience.segmentFilter),
          audience.tagIds, audience.excludedTagIds, userId],
      );
      return result.rows[0];
    });
  }

  async update(organizationId: number, id: number, updates: CampaignUpdates): Promise<RepositoryOutcome> {
    return this.transaction(async (client) => {
      const existing = await client.query<CampaignRow>(
        `SELECT ${campaignColumns('email_campaigns')} FROM email_campaigns
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [id, organizationId],
      );
      const row = existing.rows[0];
      if (!row) return { kind: 'not_found' };
      if (!['draft', 'scheduled'].includes(row.status)) return { kind: 'invalid_status', status: row.status };
      if (updates.templateId !== undefined) {
        await this.validateTemplate(client, organizationId, updates.templateId, 'templateId');
      }
      const audience = await this.validateAudience(client, organizationId, updates, row);
      const next = {
        name: updates.name ?? row.name,
        subject: updates.subject ?? row.subject,
        fromName: updates.fromName === undefined ? row.from_name : updates.fromName,
        fromEmail: updates.fromEmail === undefined ? row.from_email : updates.fromEmail,
        replyTo: updates.replyTo === undefined ? row.reply_to : updates.replyTo,
        templateId: updates.templateId === undefined ? row.template_id : updates.templateId,
        contentHtml: updates.contentHtml === undefined ? row.content_html : updates.contentHtml,
        contentText: updates.contentText === undefined ? row.content_text : updates.contentText,
      };
      const result = await client.query<CampaignRow>(
        `UPDATE email_campaigns SET name=$3, subject=$4, from_name=$5, from_email=$6,
           reply_to=$7, template_id=$8, content_html=$9, content_text=$10,
           segment_type=$11, segment_id=$12, segment_filter=$13::jsonb, tag_ids=$14,
           excluded_tag_ids=$15, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2
         RETURNING ${campaignColumns('email_campaigns')}`,
        [id, organizationId, next.name, next.subject, next.fromName, next.fromEmail,
          next.replyTo, next.templateId, next.contentHtml, next.contentText,
          audience.segmentType, audience.segmentId, JSON.stringify(audience.segmentFilter),
          audience.tagIds, audience.excludedTagIds],
      );
      return { kind: 'ok', row: result.rows[0] };
    });
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<CampaignRow | null> {
    const result = await this.pool.query<CampaignRow>(
      `INSERT INTO email_campaigns (
         organization_id, name, subject, from_name, from_email, reply_to, template_id,
         content_html, content_text, segment_type, segment_id, segment_filter,
         tag_ids, excluded_tag_ids, created_by, status
       ) SELECT organization_id, LEFT(name, 248) || ' (Copy)', subject, from_name, from_email,
         reply_to, (SELECT et.id FROM email_templates et
           WHERE et.id = email_campaigns.template_id
             AND et.organization_id = email_campaigns.organization_id),
         content_html, content_text, segment_type, segment_id,
         segment_filter, tag_ids, excluded_tag_ids, $3, 'draft'
       FROM email_campaigns WHERE id = $1 AND organization_id = $2
       RETURNING ${campaignColumns('email_campaigns')}`,
      [id, organizationId, userId],
    );
    return result.rows[0] ?? null;
  }

  async delete(organizationId: number, id: number): Promise<{ kind: 'ok' } | { kind: 'not_found' } | { kind: 'invalid_status'; status: string }> {
    return this.transaction(async (client) => {
      const existing = await client.query<{ status: string }>(
        'SELECT status FROM email_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, organizationId],
      );
      if (!existing.rows[0]) return { kind: 'not_found' };
      if (existing.rows[0].status === 'sending') return { kind: 'invalid_status', status: 'sending' };
      await client.query('DELETE FROM email_campaigns WHERE id=$1 AND organization_id=$2', [id, organizationId]);
      return { kind: 'ok' };
    });
  }

  async schedule(organizationId: number, id: number, scheduledAt: Date, timezone: string): Promise<RepositoryOutcome> {
    return this.transition(organizationId, id, ['draft', 'scheduled'], async (client) => (
      await client.query<CampaignRow>(
        `UPDATE email_campaigns SET status='scheduled', scheduled_at=$3, timezone=$4,
           send_immediately=FALSE, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 RETURNING ${campaignColumns('email_campaigns')}`,
        [id, organizationId, scheduledAt, timezone],
      )).rows[0]);
  }

  async unschedule(organizationId: number, id: number): Promise<RepositoryOutcome> {
    return this.transition(organizationId, id, ['scheduled'], async (client) => (
      await client.query<CampaignRow>(
        `UPDATE email_campaigns SET status='draft', scheduled_at=NULL,
           updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2
         RETURNING ${campaignColumns('email_campaigns')}`,
        [id, organizationId],
      )).rows[0]);
  }

  private async transition(
    organizationId: number,
    id: number,
    allowed: string[],
    mutate: (client: PoolClient) => Promise<CampaignRow>,
  ): Promise<RepositoryOutcome> {
    return this.transaction(async (client) => {
      const existing = await client.query<{ status: string }>(
        'SELECT status FROM email_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, organizationId],
      );
      if (!existing.rows[0]) return { kind: 'not_found' };
      if (!allowed.includes(existing.rows[0].status)) {
        return { kind: 'invalid_status', status: existing.rows[0].status };
      }
      return { kind: 'ok', row: await mutate(client) };
    });
  }

  private async validateTemplate(client: PoolClient, organizationId: number, id: number | null, field: string): Promise<void> {
    if (id === null) return;
    const result = await client.query(
      'SELECT 1 FROM email_templates WHERE id=$1 AND organization_id=$2',
      [id, organizationId],
    );
    if (result.rows.length !== 1) throw new CampaignValidationError('Template is not in this organization', field);
  }

  private async validateAudience(
    client: PoolClient,
    organizationId: number,
    input: Partial<AudienceValues>,
    existing?: CampaignRow,
  ): Promise<AudienceValues> {
    const segmentType = input.segmentType ?? existing?.segment_type ?? 'all';
    if (!['all', 'tag', 'status', 'segment'].includes(segmentType)) {
      throw new CampaignValidationError('segmentType is unsupported', 'segmentType');
    }
    const excludedTagIds = input.excludedTagIds ?? existing?.excluded_tag_ids ?? [];
    await this.validateTags(client, organizationId, excludedTagIds, 'excludedTagIds');
    const audience: AudienceValues = {
      segmentType, segmentId: null, segmentFilter: {}, tagIds: [], excludedTagIds,
    };
    if (segmentType === 'tag') {
      const tagIds = input.tagIds ?? (existing?.segment_type === 'tag' ? existing.tag_ids ?? [] : []);
      if (tagIds.length === 0) throw new CampaignValidationError('tagIds is required for tag targeting', 'tagIds');
      await this.validateTags(client, organizationId, tagIds, 'tagIds');
      audience.tagIds = tagIds;
    } else if (segmentType === 'status') {
      const raw = input.segmentFilter ?? (existing?.segment_type === 'status' ? existing.segment_filter : undefined);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
          !['active', 'inactive', 'archived'].includes(String((raw as Record<string, unknown>).status))) {
        throw new CampaignValidationError('segmentFilter.status is invalid', 'segmentFilter.status');
      }
      audience.segmentFilter = { status: (raw as Record<string, unknown>).status };
    } else if (segmentType === 'segment') {
      const segmentId = input.segmentId !== undefined
        ? input.segmentId
        : (existing?.segment_type === 'segment' ? existing.segment_id : null);
      if (!Number.isSafeInteger(segmentId) || Number(segmentId) < 1) {
        throw new CampaignValidationError('segmentId is required for saved-segment targeting', 'segmentId');
      }
      const result = await client.query<SegmentRow>(
        `SELECT segment_type, filter_type, filters, static_contact_ids FROM segments
         WHERE id=$1 AND organization_id=$2 AND is_active=TRUE`,
        [segmentId, organizationId],
      );
      if (result.rows.length !== 1) {
        throw new CampaignValidationError('segmentId is not an active segment in this organization', 'segmentId');
      }
      try {
        compileSegmentCondition(result.rows[0]);
      } catch (error) {
        if (error instanceof AudienceValidationError) {
          throw new CampaignValidationError(error.message, `segmentId.${error.field}`);
        }
        throw error;
      }
      audience.segmentId = Number(segmentId);
    }
    return audience;
  }

  async normalizeStoredAudience(
    client: PoolClient,
    organizationId: number,
    campaign: CampaignRow,
  ): Promise<CampaignAudience> {
    const segmentType = campaign.segment_type;
    if (!['all', 'tag', 'status', 'segment'].includes(segmentType)) {
      throw new AudienceValidationError('segment_type is unsupported', 'segmentType');
    }
    const tagIds = this.storedIds(campaign.tag_ids, 'tagIds');
    const excludedTagIds = this.storedIds(campaign.excluded_tag_ids, 'excludedTagIds');
    await this.validateTags(client, organizationId, excludedTagIds, 'excludedTagIds');
    const audience: CampaignAudience = {
      segmentType: segmentType as CampaignAudience['segmentType'],
      segmentId: null,
      segmentFilter: {},
      tagIds: [],
      excludedTagIds,
      segment: null,
    };
    if (segmentType === 'tag') {
      if (tagIds.length === 0) throw new AudienceValidationError('tagIds is required for tag targeting', 'tagIds');
      await this.validateTags(client, organizationId, tagIds, 'tagIds');
      audience.tagIds = tagIds;
    } else if (segmentType === 'status') {
      const filter = campaign.segment_filter && typeof campaign.segment_filter === 'object' &&
        !Array.isArray(campaign.segment_filter) ? campaign.segment_filter as Record<string, unknown> : null;
      if (!filter || !CONTACT_STATUSES.includes(filter.status as typeof CONTACT_STATUSES[number])) {
        throw new AudienceValidationError('segmentFilter.status is invalid', 'segmentFilter.status');
      }
      audience.segmentFilter = { status: filter.status };
    } else if (segmentType === 'segment') {
      const segmentId = Number(campaign.segment_id);
      if (!Number.isSafeInteger(segmentId) || segmentId < 1) {
        throw new AudienceValidationError('segmentId is required for saved-segment targeting', 'segmentId');
      }
      const segment = await client.query<SegmentRow>(
        `SELECT segment_type, filter_type, filters, static_contact_ids FROM segments
         WHERE id=$1 AND organization_id=$2 AND is_active=TRUE`,
        [segmentId, organizationId],
      );
      if (!segment.rows[0]) {
        throw new AudienceValidationError('segmentId is not an active segment in this organization', 'segmentId');
      }
      compileSegmentCondition(segment.rows[0]);
      audience.segmentId = segmentId;
      audience.segment = segment.rows[0];
    }
    return audience;
  }

  private storedIds(value: number[] | null, field: string): number[] {
    if (value === null) return [];
    if (!Array.isArray(value) || value.length > 100 || value.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
      throw new AudienceValidationError(`${field} must contain at most 100 positive IDs`, field);
    }
    const ids = value.map(Number);
    if (new Set(ids).size !== ids.length) throw new AudienceValidationError(`${field} cannot contain duplicate IDs`, field);
    return ids;
  }

  private async validateTags(client: PoolClient, organizationId: number, ids: number[], field: string): Promise<void> {
    if (ids.length === 0) return;
    const result = await client.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM tags WHERE organization_id=$1 AND id=ANY($2::int[])',
      [organizationId, ids],
    );
    if (Number(result.rows[0]?.total) !== ids.length) {
      throw new CampaignValidationError(`${field} contains tags outside the organization`, field);
    }
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
