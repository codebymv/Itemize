import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type TagRow = {
  id: number;
  organization_id: number;
  name: string;
  color: string | null;
  contact_count: number;
  deal_count: number;
  created_at: Date;
};

type TagValues = {
  name: string;
  color: string;
};

export type UpdateTagOutcome =
  | { kind: 'updated'; row: TagRow }
  | { kind: 'not_found' };

const tagSelection = `
  t.id,
  t.organization_id,
  t.name,
  t.color,
  t.created_at,
  COUNT(DISTINCT ct.contact_id)::int AS contact_count,
  COUNT(DISTINCT dt.deal_id)::int AS deal_count`;

@Injectable()
export class TagsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(organizationId: number): Promise<TagRow[]> {
    const result = await this.pool.query<TagRow>(
      `SELECT ${tagSelection}
       FROM tags t
       LEFT JOIN contact_tags ct ON ct.tag_id = t.id
       LEFT JOIN deal_tags dt ON dt.tag_id = t.id
       WHERE t.organization_id = $1
       GROUP BY t.id
       ORDER BY lower(t.name), t.id`,
      [organizationId],
    );
    return result.rows;
  }

  async suggestions(organizationId: number): Promise<string[]> {
    const result = await this.pool.query<{ name: string }>(
      `SELECT name
       FROM tags
       WHERE organization_id = $1
       ORDER BY lower(name), id`,
      [organizationId],
    );
    return result.rows.map((row) => row.name);
  }

  async create(organizationId: number, values: TagValues): Promise<TagRow> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO tags (organization_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [organizationId, values.name, values.color],
      );
      return this.findById(client, organizationId, Number(inserted.rows[0].id));
    });
  }

  async update(
    organizationId: number,
    tagId: number,
    values: Partial<TagValues>,
  ): Promise<UpdateTagOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const current = await client.query(
        `SELECT id
         FROM tags
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [tagId, organizationId],
      );
      if (current.rows.length === 0) return { kind: 'not_found' };

      const clauses: string[] = [];
      const parameters: unknown[] = [];
      if (values.name !== undefined) {
        parameters.push(values.name);
        clauses.push(`name = $${parameters.length}`);
      }
      if (values.color !== undefined) {
        parameters.push(values.color);
        clauses.push(`color = $${parameters.length}`);
      }
      if (clauses.length > 0) {
        parameters.push(tagId, organizationId);
        await client.query(
          `UPDATE tags
           SET ${clauses.join(', ')}
           WHERE id = $${parameters.length - 1}
             AND organization_id = $${parameters.length}`,
          parameters,
        );
      }
      return {
        kind: 'updated',
        row: await this.findById(client, organizationId, tagId),
      };
    });
  }

  async delete(organizationId: number, tagId: number): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM tags
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [tagId, organizationId],
    );
    return result.rows.length > 0;
  }

  private async findById(
    client: PoolClient,
    organizationId: number,
    tagId: number,
  ): Promise<TagRow> {
    const result = await client.query<TagRow>(
      `SELECT ${tagSelection}
       FROM tags t
       LEFT JOIN contact_tags ct ON ct.tag_id = t.id
       LEFT JOIN deal_tags dt ON dt.tag_id = t.id
       WHERE t.organization_id = $1 AND t.id = $2
       GROUP BY t.id`,
      [organizationId, tagId],
    );
    if (!result.rows[0]) throw new Error('Tag disappeared inside its transaction');
    return result.rows[0];
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
