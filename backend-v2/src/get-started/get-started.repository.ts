import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { GetStartedMilestoneName } from './get-started.constants';

export type GetStartedMilestoneRow = {
  name: GetStartedMilestoneName;
  occurred_at: Date;
};

export type GetStartedLiveCounts = {
  contacts: number;
  lists: number;
  invoices: number;
  deals: number;
};

@Injectable()
export class GetStartedRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findMilestones(
    organizationId: number,
  ): Promise<GetStartedMilestoneRow[]> {
    const result = await this.pool.query<GetStartedMilestoneRow>(
      `SELECT name, occurred_at
       FROM get_started_milestones
       WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows;
  }

  async insertMilestone(input: {
    organizationId: number;
    userId: number | null;
    name: GetStartedMilestoneName;
    source: string;
    dedupeKey: string;
    properties: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO get_started_milestones (
         organization_id, name, user_id, source, dedupe_key, properties
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        input.organizationId,
        input.name,
        input.userId,
        input.source,
        input.dedupeKey,
        JSON.stringify(input.properties),
      ],
    );
  }

  async liveCounts(organizationId: number): Promise<GetStartedLiveCounts> {
    const result = await this.pool.query<GetStartedLiveCounts>(
      `SELECT
         (SELECT COUNT(*)::int FROM contacts WHERE organization_id = $1) AS contacts,
         (SELECT COUNT(*)::int FROM lists
           WHERE organization_id = $1
              OR (
                organization_id IS NULL
                AND user_id IN (
                  SELECT user_id FROM organization_members WHERE organization_id = $1
                )
              )
         ) AS lists,
         (SELECT COUNT(*)::int FROM invoices WHERE organization_id = $1) AS invoices,
         (SELECT COUNT(*)::int FROM deals WHERE organization_id = $1) AS deals`,
      [organizationId],
    );
    return result.rows[0] ?? { contacts: 0, lists: 0, invoices: 0, deals: 0 };
  }

  async isDismissed(organizationId: number, userId: number): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM get_started_dismissals
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    return result.rows.length > 0;
  }

  async dismiss(organizationId: number, userId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO get_started_dismissals (organization_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organizationId, userId],
    );
  }
}
