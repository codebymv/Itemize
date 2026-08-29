import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { extractEmailTemplateVariables } from './email-template.variables';

export type EmailTemplateRow = {
  id: number;
  organization_id: number;
  name: string;
  subject: string;
  preheader: string | null;
  body_html: string;
  body_text: string | null;
  variables: unknown;
  category: string;
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: Date;
  updated_at: Date;
  draft_version_id: number | null;
  published_version_id: number | null;
  draft_version?: number | null;
  draft_subject?: string | null;
  draft_preheader?: string | null;
  draft_body_html?: string | null;
  draft_body_text?: string | null;
  draft_updated_at?: Date | null;
  draft_is_active?: boolean | null;
  published_version?: number | null;
};

export type EmailTemplateValues = {
  name: string;
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  bodyText: string | null;
  variables: string[];
  category: string;
  isActive: boolean;
};

export type EmailTemplateUpdates = Partial<Omit<EmailTemplateValues, 'variables'>>;

export type EmailTemplateCriteria = {
  organizationId: number;
  category?: string;
  isActive?: boolean;
  searchPattern?: string;
  pageSize: number;
  offset: number;
};

const columns = (alias = 'et') => `
  ${alias}.id, ${alias}.organization_id, ${alias}.name, ${alias}.subject,
  ${alias}.preheader, ${alias}.body_html, ${alias}.body_text, ${alias}.variables, ${alias}.category,
  ${alias}.is_active, ${alias}.created_by, ${alias}.created_at, ${alias}.updated_at,
  ${alias}.draft_version_id, ${alias}.published_version_id`;

const versionColumns = `
  draft.version_number AS draft_version, draft.subject AS draft_subject,
  draft.preheader AS draft_preheader, draft.body_html AS draft_body_html,
  draft.body_text AS draft_body_text, draft.updated_at AS draft_updated_at,
  draft.is_active AS draft_is_active,
  published.version_number AS published_version`;

@Injectable()
export class EmailTemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(organizationId: number, id: number): Promise<EmailTemplateRow | null> {
    return this.selectById(this.pool, organizationId, id);
  }

  private async selectById(
    queryable: Pick<PoolClient, 'query'>,
    organizationId: number,
    id: number,
  ): Promise<EmailTemplateRow | null> {
    const result = await queryable.query<EmailTemplateRow>(
      `SELECT ${columns()}, ${versionColumns}, u.name AS created_by_name
       FROM email_templates et
       LEFT JOIN email_template_versions draft ON draft.id = et.draft_version_id
         AND draft.organization_id = et.organization_id
       LEFT JOIN email_template_versions published ON published.id = et.published_version_id
         AND published.organization_id = et.organization_id
       LEFT JOIN users u ON u.id = et.created_by
       WHERE et.id = $1 AND et.organization_id = $2`,
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async findPage(criteria: EmailTemplateCriteria): Promise<{ rows: EmailTemplateRow[]; total: string }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['et.organization_id = $1'];
    if (criteria.category !== undefined) {
      parameters.push(criteria.category);
      clauses.push(`et.category = $${parameters.length}`);
    }
    if (criteria.isActive !== undefined) {
      parameters.push(criteria.isActive);
      clauses.push(`et.is_active = $${parameters.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      parameters.push(criteria.searchPattern);
      clauses.push(`(et.name ILIKE $${parameters.length} ESCAPE '\\' OR et.subject ILIKE $${parameters.length} ESCAPE '\\')`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM email_templates et WHERE ${where}`,
      parameters,
    );
    parameters.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<EmailTemplateRow>(
      `SELECT ${columns()}, ${versionColumns}, u.name AS created_by_name
       FROM email_templates et
       LEFT JOIN email_template_versions draft ON draft.id = et.draft_version_id
         AND draft.organization_id = et.organization_id
       LEFT JOIN email_template_versions published ON published.id = et.published_version_id
         AND published.organization_id = et.organization_id
       LEFT JOIN users u ON u.id = et.created_by
       WHERE ${where}
       ORDER BY et.updated_at DESC, et.id DESC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? '0' };
  }

  async categories(organizationId: number): Promise<Array<{ category: string; count: string }>> {
    const result = await this.pool.query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) AS count
       FROM email_templates
       WHERE organization_id = $1
       GROUP BY category
       ORDER BY category ASC`,
      [organizationId],
    );
    return result.rows;
  }

  async create(
    organizationId: number,
    userId: number,
    values: EmailTemplateValues,
  ): Promise<EmailTemplateRow> {
    return this.transaction(async (client) => {
      const result = await client.query<EmailTemplateRow>(
        `INSERT INTO email_templates (
           organization_id, name, subject, preheader, body_html, body_text,
           variables, category, is_active, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         RETURNING ${columns('email_templates')}`,
        [organizationId, values.name, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.category, values.isActive, userId],
      );
      const template = result.rows[0];
      const version = await client.query<{ id: number }>(
        `INSERT INTO email_template_versions (
           organization_id, template_id, version_number, state, subject, preheader,
           body_html, body_text, variables, is_active, created_by, published_at
         ) VALUES ($1,$2,1,'published',$3,$4,$5,$6,$7::jsonb,$8,$9,CURRENT_TIMESTAMP)
         RETURNING id`,
        [organizationId, template.id, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.isActive, userId],
      );
      await client.query(
        'UPDATE email_templates SET published_version_id=$2 WHERE id=$1',
        [template.id, version.rows[0].id],
      );
      return (await this.selectById(client, organizationId, Number(template.id)))!;
    });
  }

  async createDraft(
    organizationId: number,
    userId: number,
    values: EmailTemplateValues,
  ): Promise<EmailTemplateRow> {
    return this.transaction(async (client) => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO email_templates (
           organization_id,name,subject,preheader,body_html,body_text,variables,category,is_active,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,FALSE,$9) RETURNING id`,
        [organizationId, values.name, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.category, userId],
      );
      const templateId = Number(inserted.rows[0].id);
      const version = await client.query<{ id: number }>(
        `INSERT INTO email_template_versions (
           organization_id,template_id,version_number,state,subject,preheader,body_html,body_text,
           variables,is_active,created_by
         ) VALUES ($1,$2,1,'draft',$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id`,
        [organizationId, templateId, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.isActive, userId],
      );
      await client.query('UPDATE email_templates SET draft_version_id=$2 WHERE id=$1',
        [templateId, version.rows[0].id]);
      return (await this.selectById(client, organizationId, templateId))!;
    });
  }

  async saveDraft(
    organizationId: number,
    id: number,
    userId: number,
    values: EmailTemplateValues,
  ): Promise<EmailTemplateRow | null> {
    return this.transaction(async (client) => {
      const existing = await client.query<Pick<EmailTemplateRow, 'id' | 'draft_version_id'>>(
        `SELECT id,draft_version_id FROM email_templates
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [id, organizationId],
      );
      if (!existing.rows[0]) return null;
      let draftId = existing.rows[0].draft_version_id;
      if (draftId) {
        await client.query(
          `UPDATE email_template_versions SET subject=$3,preheader=$4,body_html=$5,body_text=$6,
             variables=$7::jsonb,is_active=$8,updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND organization_id=$2 AND state='draft'`,
          [draftId, organizationId, values.subject, values.preheader, values.bodyHtml,
            values.bodyText, JSON.stringify(values.variables), values.isActive],
        );
      } else {
        const version = await client.query<{ id: number }>(
          `INSERT INTO email_template_versions (
             organization_id,template_id,version_number,state,subject,preheader,body_html,body_text,
             variables,is_active,created_by
           ) SELECT $2,$1,COALESCE(MAX(version_number),0)+1,'draft',$3,$4,$5,$6,$7::jsonb,$8,$9
             FROM email_template_versions WHERE template_id=$1 RETURNING id`,
          [id, organizationId, values.subject, values.preheader, values.bodyHtml,
            values.bodyText, JSON.stringify(values.variables), values.isActive, userId],
        );
        draftId = version.rows[0].id;
      }
      await client.query(
        `UPDATE email_templates SET name=$3,category=$4,draft_version_id=$5,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [id, organizationId, values.name, values.category, draftId],
      );
      return this.selectById(client, organizationId, id);
    });
  }

  async publishDraft(
    organizationId: number,
    id: number,
    userId: number,
    isActive?: boolean,
  ): Promise<EmailTemplateRow | null> {
    return this.transaction(async (client) => {
      const template = await client.query<{
        draft_version_id: number | null; published_version_id: number | null; is_active: boolean;
      }>(`SELECT draft_version_id,published_version_id,is_active FROM email_templates
          WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [id, organizationId]);
      const row = template.rows[0];
      if (!row?.draft_version_id) return null;
      const draft = await client.query<{
        id: number; subject: string; preheader: string | null; body_html: string;
        body_text: string | null; variables: unknown; is_active: boolean;
      }>(`SELECT id,subject,preheader,body_html,body_text,variables,is_active
          FROM email_template_versions WHERE id=$1 AND organization_id=$2 AND state='draft' FOR UPDATE`,
      [row.draft_version_id, organizationId]);
      if (!draft.rows[0]) return null;
      const content = draft.rows[0];
      await client.query(
        `UPDATE email_template_versions SET state='published',published_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP,created_by=COALESCE(created_by,$3)
         WHERE id=$1 AND organization_id=$2`, [content.id, organizationId, userId],
      );
      await client.query(
        `UPDATE email_templates SET subject=$3,preheader=$4,body_html=$5,body_text=$6,
           variables=$7::jsonb,published_version_id=$8,draft_version_id=NULL,
           is_active=$9,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,
        [id, organizationId, content.subject, content.preheader, content.body_html, content.body_text,
          JSON.stringify(content.variables ?? []), content.id,
          isActive ?? content.is_active ?? (row.published_version_id ? row.is_active : true)],
      );
      return this.selectById(client, organizationId, id);
    });
  }

  async update(
    organizationId: number,
    id: number,
    updates: EmailTemplateUpdates,
  ): Promise<EmailTemplateRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<EmailTemplateRow>(
        `SELECT ${columns('email_templates')}
         FROM email_templates
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, organizationId],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      const values: EmailTemplateValues = {
        name: updates.name ?? row.name,
        subject: updates.subject ?? row.subject,
        preheader: updates.preheader === undefined ? row.preheader : updates.preheader,
        bodyHtml: updates.bodyHtml ?? row.body_html,
        bodyText: updates.bodyText === undefined ? row.body_text : updates.bodyText,
        category: updates.category ?? row.category,
        isActive: updates.isActive ?? row.is_active,
        variables: [],
      };
      values.variables = extractEmailTemplateVariables(
        values.subject, values.preheader, values.bodyHtml, values.bodyText,
      );
      const updated = await client.query<EmailTemplateRow>(
        `UPDATE email_templates SET
           name = $3, subject = $4, preheader = $5, body_html = $6, body_text = $7,
           variables = $8::jsonb, category = $9, is_active = $10,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING ${columns('email_templates')}`,
        [
          id, organizationId, values.name, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.category, values.isActive,
        ],
      );
      const version = await client.query<{ id: number }>(
        `INSERT INTO email_template_versions (
           organization_id,template_id,version_number,state,subject,preheader,body_html,body_text,
           variables,is_active,created_by,published_at
         ) SELECT $2,$1,COALESCE(MAX(version_number),0)+1,'published',$3,$4,$5,$6,$7::jsonb,
             $8,$9,CURRENT_TIMESTAMP
           FROM email_template_versions WHERE template_id=$1 RETURNING id`,
        [id, organizationId, values.subject, values.preheader, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.isActive, row.created_by],
      );
      await client.query(
        `DELETE FROM email_template_versions WHERE template_id=$1 AND state='draft'`, [id],
      );
      await client.query(
        `UPDATE email_templates SET published_version_id=$3,draft_version_id=NULL
         WHERE id=$1 AND organization_id=$2`, [id, organizationId, version.rows[0].id],
      );
      await client.query('COMMIT');
      return updated.rows[0]
        ? await this.selectById(client, organizationId, id)
        : null;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async duplicate(
    organizationId: number,
    id: number,
    userId: number,
  ): Promise<EmailTemplateRow | null> {
    return this.transaction(async (client) => {
      const result = await client.query<EmailTemplateRow>(
        `INSERT INTO email_templates (
           organization_id,name,subject,preheader,body_html,body_text,variables,category,is_active,created_by
         ) SELECT organization_id,LEFT(name,248) || ' (Copy)',subject,preheader,body_html,body_text,
             variables,category,FALSE,$3 FROM email_templates
           WHERE id=$1 AND organization_id=$2 RETURNING ${columns('email_templates')}`,
        [id, organizationId, userId],
      );
      const copy = result.rows[0];
      if (!copy) return null;
      const version = await client.query<{ id: number }>(
        `INSERT INTO email_template_versions (
           organization_id,template_id,version_number,state,subject,preheader,body_html,body_text,
           variables,is_active,created_by,published_at
         ) VALUES ($1,$2,1,'published',$3,$4,$5,$6,$7::jsonb,$8,$9,CURRENT_TIMESTAMP) RETURNING id`,
        [organizationId, copy.id, copy.subject, copy.preheader, copy.body_html,
          copy.body_text, JSON.stringify(copy.variables), copy.is_active, userId],
      );
      await client.query('UPDATE email_templates SET published_version_id=$2 WHERE id=$1',
        [copy.id, version.rows[0].id]);
      return this.selectById(client, organizationId, Number(copy.id));
    });
  }

  async delete(organizationId: number, id: number): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM email_templates
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [id, organizationId],
    );
    return result.rows.length === 1;
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
