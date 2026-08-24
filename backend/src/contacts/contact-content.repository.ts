import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ContactContentRow = {
  id: number;
  title: string;
  category: string | null;
  created_at: Date;
  total: number;
};

export type ContactContentRows = {
  lists: ContactContentRow[];
  notes: ContactContentRow[];
  whiteboards: ContactContentRow[];
};

@Injectable()
export class ContactContentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(
    organizationId: number,
    contactId: number,
    limit: number,
  ): Promise<ContactContentRows | null> {
    const client = await this.pool.connect();
    try {
      const contact = await client.query(
        'SELECT 1 FROM contacts WHERE organization_id = $1 AND id = $2',
        [organizationId, contactId],
      );
      if (contact.rowCount !== 1) return null;

      return {
        lists: await this.findRows(client, 'lists', contactId, limit),
        notes: await this.findRows(client, 'notes', contactId, limit),
        whiteboards: await this.findRows(client, 'whiteboards', contactId, limit),
      };
    } finally {
      client.release();
    }
  }

  private async findRows(
    client: PoolClient,
    table: 'lists' | 'notes' | 'whiteboards',
    contactId: number,
    limit: number,
  ): Promise<ContactContentRow[]> {
    const result = await client.query<ContactContentRow>(
      `SELECT id, title, category, created_at, COUNT(*) OVER()::int AS total
       FROM ${table}
       WHERE contact_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [contactId, limit],
    );
    return result.rows;
  }
}
