import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ContactActivityType } from './contact.enums';

export type ContactActivityRow = {
  id: number;
  contact_id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  type: ContactActivityType;
  title: string | null;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

export type ContactActivityCriteria = {
  organizationId: number;
  contactId: number;
  type?: ContactActivityType;
  pageSize: number;
  offset: number;
};

export type ContactActivityCreateValues = {
  type: ContactActivityType;
  title: string | null;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const activitySelection = `
  ca.id, ca.contact_id, ca.user_id,
  u.name AS user_name, u.email AS user_email,
  ca.type, ca.title, ca.content, ca.metadata, ca.created_at`;

@Injectable()
export class ContactActivitiesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: ContactActivityCriteria,
  ): Promise<{ rows: ContactActivityRow[]; total: number } | null> {
    const client = await this.pool.connect();
    try {
      if (!(await this.contactExists(client, criteria.organizationId, criteria.contactId))) {
        return null;
      }
      const parameters: unknown[] = [criteria.organizationId, criteria.contactId];
      const typeClause = criteria.type
        ? ` AND ca.type = $${parameters.push(criteria.type)}`
        : '';
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM contact_activities ca
         JOIN contacts c ON c.id = ca.contact_id
         WHERE c.organization_id = $1 AND ca.contact_id = $2${typeClause}`,
        parameters,
      );
      const rows = await client.query<ContactActivityRow>(
        `SELECT ${activitySelection}
         FROM contact_activities ca
         JOIN contacts c ON c.id = ca.contact_id
         LEFT JOIN users u ON u.id = ca.user_id
         WHERE c.organization_id = $1 AND ca.contact_id = $2${typeClause}
         ORDER BY ca.created_at DESC, ca.id DESC
         LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, criteria.pageSize, criteria.offset],
      );
      return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    contactId: number,
    userId: number,
    values: ContactActivityCreateValues,
  ): Promise<ContactActivityRow | null> {
    return this.transaction(async (client) => {
      const contact = await client.query(
        `SELECT id FROM contacts
         WHERE organization_id = $1 AND id = $2
         FOR KEY SHARE`,
        [organizationId, contactId],
      );
      if (contact.rowCount !== 1) return null;
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO contact_activities (
           contact_id, user_id, type, title, content, metadata
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
         RETURNING id`,
        [
          contactId,
          userId,
          values.type,
          values.title,
          JSON.stringify(values.content),
          JSON.stringify(values.metadata),
        ],
      );
      const result = await client.query<ContactActivityRow>(
        `SELECT ${activitySelection}
         FROM contact_activities ca
         LEFT JOIN users u ON u.id = ca.user_id
         WHERE ca.id = $1`,
        [inserted.rows[0].id],
      );
      return result.rows[0] ?? null;
    });
  }

  private async contactExists(
    client: PoolClient,
    organizationId: number,
    contactId: number,
  ): Promise<boolean> {
    const result = await client.query(
      'SELECT 1 FROM contacts WHERE organization_id = $1 AND id = $2',
      [organizationId, contactId],
    );
    return result.rowCount === 1;
  }

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
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
