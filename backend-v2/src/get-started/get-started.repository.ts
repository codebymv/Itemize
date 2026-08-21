import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { GetStartedMilestoneName } from './get-started.constants';

export type GetStartedMilestoneRow = {
  name: GetStartedMilestoneName;
  occurred_at: Date;
};

export type GetStartedLiveState = {
  plan: string | null;
  contacts: number;
  lists: number;
  first_artifact_at: Date | null;
  first_artifact_type: 'estimate' | 'invoice' | 'signature' | null;
  artifact_sent_at: Date | null;
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

  async liveState(organizationId: number): Promise<GetStartedLiveState> {
    const result = await this.pool.query<GetStartedLiveState>(
      `SELECT
         organization.plan,
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
         artifact.created_at AS first_artifact_at,
         artifact.artifact_type AS first_artifact_type,
         (SELECT MIN(event.occurred_at)
            FROM activation_events event
           WHERE event.organization_id = $1
             AND event.event_name = 'artifact_sent') AS artifact_sent_at
       FROM organizations organization
       LEFT JOIN LATERAL (
         SELECT candidate.artifact_type, candidate.created_at
         FROM (
           SELECT 'estimate'::text AS artifact_type, created_at
             FROM estimates WHERE organization_id = $1
           UNION ALL
           SELECT 'invoice'::text AS artifact_type, created_at
             FROM invoices WHERE organization_id = $1
           UNION ALL
           SELECT 'signature'::text AS artifact_type, created_at
             FROM signature_documents WHERE organization_id = $1
         ) candidate
         ORDER BY candidate.created_at ASC
         LIMIT 1
       ) artifact ON TRUE
       WHERE organization.id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? {
      plan: null,
      contacts: 0,
      lists: 0,
      first_artifact_at: null,
      first_artifact_type: null,
      artifact_sent_at: null,
    };
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
