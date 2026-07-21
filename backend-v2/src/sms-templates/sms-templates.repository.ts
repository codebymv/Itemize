import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { extractSmsTemplateVariables } from './sms-message-info';

export type SmsTemplateRow = {
  id: number; organization_id: number; name: string; message: string; variables: unknown;
  category: string; is_active: boolean; created_by: number | null; created_by_name?: string | null;
  created_at: Date; updated_at: Date;
};
export type SmsTemplateValues = { name: string; message: string; variables: string[]; category: string; isActive: boolean };
export type SmsTemplateUpdates = Partial<Omit<SmsTemplateValues, 'variables'>>;
export type SmsTemplateCriteria = { organizationId: number; category?: string; isActive?: boolean; searchPattern?: string; pageSize: number; offset: number };

const columns = (alias = 'st') => `${alias}.id, ${alias}.organization_id, ${alias}.name, ${alias}.message,
  ${alias}.variables, ${alias}.category, ${alias}.is_active, ${alias}.created_by,
  ${alias}.created_at, ${alias}.updated_at`;

@Injectable()
export class SmsTemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(organizationId: number, id: number): Promise<SmsTemplateRow | null> {
    const result = await this.pool.query<SmsTemplateRow>(
      `SELECT ${columns()}, u.name AS created_by_name FROM sms_templates st
       LEFT JOIN users u ON u.id = st.created_by WHERE st.id = $1 AND st.organization_id = $2`, [id, organizationId]);
    return result.rows[0] ?? null;
  }

  async findPage(criteria: SmsTemplateCriteria): Promise<{ rows: SmsTemplateRow[]; total: string }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['st.organization_id = $1'];
    if (criteria.category !== undefined) { parameters.push(criteria.category); clauses.push(`st.category = $${parameters.length}`); }
    if (criteria.isActive !== undefined) { parameters.push(criteria.isActive); clauses.push(`st.is_active = $${parameters.length}`); }
    if (criteria.searchPattern !== undefined) {
      parameters.push(criteria.searchPattern);
      clauses.push(`(st.name ILIKE $${parameters.length} ESCAPE '\\' OR st.message ILIKE $${parameters.length} ESCAPE '\\')`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM sms_templates st WHERE ${where}`, parameters);
    parameters.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<SmsTemplateRow>(
      `SELECT ${columns()}, u.name AS created_by_name FROM sms_templates st
       LEFT JOIN users u ON u.id = st.created_by WHERE ${where}
       ORDER BY st.updated_at DESC, st.id DESC LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`, parameters);
    return { rows: rows.rows, total: count.rows[0]?.total ?? '0' };
  }

  async categories(organizationId: number) {
    return (await this.pool.query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) AS count FROM sms_templates WHERE organization_id = $1
       GROUP BY category ORDER BY category ASC`, [organizationId])).rows;
  }

  async create(organizationId: number, userId: number, values: SmsTemplateValues): Promise<SmsTemplateRow> {
    return (await this.pool.query<SmsTemplateRow>(
      `INSERT INTO sms_templates (organization_id, name, message, variables, category, is_active, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING ${columns('sms_templates')}`,
      [organizationId, values.name, values.message, JSON.stringify(values.variables), values.category, values.isActive, userId])).rows[0];
  }

  async update(organizationId: number, id: number, updates: SmsTemplateUpdates): Promise<SmsTemplateRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<SmsTemplateRow>(
        `SELECT ${columns('sms_templates')} FROM sms_templates WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [id, organizationId]);
      const row = existing.rows[0];
      if (!row) { await client.query('ROLLBACK'); return null; }
      const values: SmsTemplateValues = {
        name: updates.name ?? row.name, message: updates.message ?? row.message,
        category: updates.category ?? row.category, isActive: updates.isActive ?? row.is_active, variables: [],
      };
      values.variables = extractSmsTemplateVariables(values.message);
      const result = await client.query<SmsTemplateRow>(
        `UPDATE sms_templates SET name = $3, message = $4, variables = $5::jsonb, category = $6,
         is_active = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2
         RETURNING ${columns('sms_templates')}`,
        [id, organizationId, values.name, values.message, JSON.stringify(values.variables), values.category, values.isActive]);
      await client.query('COMMIT');
      return result.rows[0] ?? null;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<SmsTemplateRow | null> {
    return (await this.pool.query<SmsTemplateRow>(
      `INSERT INTO sms_templates (organization_id, name, message, variables, category, is_active, created_by)
       SELECT organization_id, LEFT(name, 248) || ' (Copy)', message, variables, category, FALSE, $3
       FROM sms_templates WHERE id = $1 AND organization_id = $2 RETURNING ${columns('sms_templates')}`,
      [id, organizationId, userId])).rows[0] ?? null;
  }

  async delete(organizationId: number, id: number): Promise<boolean> {
    return (await this.pool.query('DELETE FROM sms_templates WHERE id = $1 AND organization_id = $2 RETURNING id', [id, organizationId])).rows.length === 1;
  }
}
