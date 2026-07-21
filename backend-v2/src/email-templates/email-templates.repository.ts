import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { extractEmailTemplateVariables } from './email-template.variables';

export type EmailTemplateRow = {
  id: number;
  organization_id: number;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: unknown;
  category: string;
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: Date;
  updated_at: Date;
};

export type EmailTemplateValues = {
  name: string;
  subject: string;
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
  ${alias}.body_html, ${alias}.body_text, ${alias}.variables, ${alias}.category,
  ${alias}.is_active, ${alias}.created_by, ${alias}.created_at, ${alias}.updated_at`;

@Injectable()
export class EmailTemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(organizationId: number, id: number): Promise<EmailTemplateRow | null> {
    const result = await this.pool.query<EmailTemplateRow>(
      `SELECT ${columns()}, u.name AS created_by_name
       FROM email_templates et
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
      `SELECT ${columns()}, u.name AS created_by_name
       FROM email_templates et
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
    const result = await this.pool.query<EmailTemplateRow>(
      `INSERT INTO email_templates (
         organization_id, name, subject, body_html, body_text,
         variables, category, is_active, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING ${columns('email_templates')}`,
      [
        organizationId, values.name, values.subject, values.bodyHtml, values.bodyText,
        JSON.stringify(values.variables), values.category, values.isActive, userId,
      ],
    );
    return result.rows[0];
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
        bodyHtml: updates.bodyHtml ?? row.body_html,
        bodyText: updates.bodyText === undefined ? row.body_text : updates.bodyText,
        category: updates.category ?? row.category,
        isActive: updates.isActive ?? row.is_active,
        variables: [],
      };
      values.variables = extractEmailTemplateVariables(values.subject, values.bodyHtml, values.bodyText);
      const updated = await client.query<EmailTemplateRow>(
        `UPDATE email_templates SET
           name = $3, subject = $4, body_html = $5, body_text = $6,
           variables = $7::jsonb, category = $8, is_active = $9,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING ${columns('email_templates')}`,
        [
          id, organizationId, values.name, values.subject, values.bodyHtml,
          values.bodyText, JSON.stringify(values.variables), values.category, values.isActive,
        ],
      );
      await client.query('COMMIT');
      return updated.rows[0] ?? null;
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
    const result = await this.pool.query<EmailTemplateRow>(
      `INSERT INTO email_templates (
         organization_id, name, subject, body_html, body_text,
         variables, category, is_active, created_by
       )
       SELECT organization_id, LEFT(name, 248) || ' (Copy)', subject, body_html, body_text,
         variables, category, FALSE, $3
       FROM email_templates
       WHERE id = $1 AND organization_id = $2
       RETURNING ${columns('email_templates')}`,
      [id, organizationId, userId],
    );
    return result.rows[0] ?? null;
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
}
