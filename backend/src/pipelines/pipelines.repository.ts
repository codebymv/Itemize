import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type PipelineStageValue = {
  id: string;
  name: string;
  order: number;
  color: string;
};

export type PipelineRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  stages: PipelineStageValue[] | null;
  is_default: boolean;
  created_by: number | null;
  deal_count: number;
  total_value: string;
  created_at: Date;
  updated_at: Date;
};

export type PipelineDealRow = {
  id: number;
  organization_id: number;
  pipeline_id: number;
  contact_id: number | null;
  stage_id: string;
  title: string;
  value: string;
  currency: string;
  probability: number;
  expected_close_date: string | Date | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number | null;
  won_at: Date | null;
  lost_at: Date | null;
  lost_reason: string | null;
  custom_fields: Record<string, unknown> | null;
  tags: string[] | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePipelineValues = {
  name: string;
  description: string | null;
  stages: PipelineStageValue[];
  isDefault: boolean;
};

export type UpdatePipelineValues = Partial<{
  name: string;
  description: string | null;
  stages: PipelineStageValue[];
  isDefault: boolean;
}>;

export type UpdatePipelineOutcome =
  | { kind: 'updated'; row: PipelineRow }
  | { kind: 'not_found' }
  | { kind: 'stage_in_use'; stageIds: string[] };

export type DeletePipelineOutcome =
  | { kind: 'deleted' }
  | { kind: 'not_found' }
  | { kind: 'has_deals' };

const pipelineSelection = `
  p.id,
  p.organization_id,
  p.name,
  p.description,
  p.stages,
  p.is_default,
  p.created_by,
  p.created_at,
  p.updated_at,
  COUNT(d.id)::int AS deal_count,
  COALESCE(
    SUM(d.value) FILTER (WHERE d.won_at IS NULL AND d.lost_at IS NULL),
    0
  )::text AS total_value`;

@Injectable()
export class PipelinesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(organizationId: number): Promise<PipelineRow[]> {
    const result = await this.pool.query<PipelineRow>(
      `SELECT ${pipelineSelection}
       FROM pipelines p
       LEFT JOIN deals d
         ON d.pipeline_id = p.id
        AND d.organization_id = p.organization_id
       WHERE p.organization_id = $1
       GROUP BY p.id
       ORDER BY p.is_default DESC, lower(p.name), p.id`,
      [organizationId],
    );
    return result.rows;
  }

  async findById(
    organizationId: number,
    pipelineId: number,
  ): Promise<{ pipeline: PipelineRow; deals: PipelineDealRow[] } | null> {
    const client = await this.pool.connect();
    try {
      const pipeline = await this.selectById(client, organizationId, pipelineId);
      if (!pipeline) return null;
      const deals = await client.query<PipelineDealRow>(
        `SELECT
           d.id,
           d.organization_id,
           d.pipeline_id,
           d.contact_id,
           d.stage_id,
           d.title,
           d.value::text,
           d.currency,
           d.probability,
           d.expected_close_date,
           d.assigned_to,
           member_user.name AS assigned_to_name,
           d.created_by,
           d.won_at,
           d.lost_at,
           d.lost_reason,
           d.custom_fields,
           d.tags,
           contact.first_name AS contact_first_name,
           contact.last_name AS contact_last_name,
           contact.email AS contact_email,
           d.created_at,
           d.updated_at
         FROM deals d
         LEFT JOIN contacts contact
           ON contact.id = d.contact_id
          AND contact.organization_id = d.organization_id
         LEFT JOIN organization_members member
           ON member.organization_id = d.organization_id
          AND member.user_id = d.assigned_to
         LEFT JOIN users member_user ON member_user.id = member.user_id
         WHERE d.organization_id = $1 AND d.pipeline_id = $2
         ORDER BY d.created_at DESC, d.id DESC`,
        [organizationId, pipelineId],
      );
      return { pipeline, deals: deals.rows };
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: CreatePipelineValues,
  ): Promise<PipelineRow> {
    return this.transaction(async (client) => {
      if (values.isDefault) {
        await this.clearOtherDefaults(client, organizationId);
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO pipelines (
           organization_id, name, description, stages, is_default, created_by
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         RETURNING id`,
        [
          organizationId,
          values.name,
          values.description,
          JSON.stringify(values.stages),
          values.isDefault,
          userId,
        ],
      );
      const row = await this.selectById(
        client,
        organizationId,
        Number(inserted.rows[0].id),
      );
      if (!row) throw new Error('Pipeline disappeared inside its transaction');
      return row;
    });
  }

  async update(
    organizationId: number,
    pipelineId: number,
    values: UpdatePipelineValues,
  ): Promise<UpdatePipelineOutcome> {
    return this.transaction(async (client) => {
      const current = await client.query<{ id: number }>(
        `SELECT id
         FROM pipelines
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [pipelineId, organizationId],
      );
      if (current.rows.length === 0) return { kind: 'not_found' };

      if (values.stages !== undefined) {
        const stageIds = new Set(values.stages.map((stage) => stage.id));
        const used = await client.query<{ stage_id: string }>(
          `SELECT DISTINCT stage_id
           FROM deals
           WHERE pipeline_id = $1 AND organization_id = $2`,
          [pipelineId, organizationId],
        );
        const removed = used.rows
          .map((row) => row.stage_id)
          .filter((stageId) => !stageIds.has(stageId));
        if (removed.length > 0) {
          return { kind: 'stage_in_use', stageIds: removed };
        }
      }

      if (values.isDefault === true) {
        await this.clearOtherDefaults(client, organizationId, pipelineId);
      }

      const clauses: string[] = [];
      const parameters: unknown[] = [];
      if (values.name !== undefined) {
        parameters.push(values.name);
        clauses.push(`name = $${parameters.length}`);
      }
      if (values.description !== undefined) {
        parameters.push(values.description);
        clauses.push(`description = $${parameters.length}`);
      }
      if (values.stages !== undefined) {
        parameters.push(JSON.stringify(values.stages));
        clauses.push(`stages = $${parameters.length}::jsonb`);
      }
      if (values.isDefault !== undefined) {
        parameters.push(values.isDefault);
        clauses.push(`is_default = $${parameters.length}`);
      }
      if (clauses.length > 0) {
        parameters.push(pipelineId, organizationId);
        await client.query(
          `UPDATE pipelines
           SET ${clauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $${parameters.length - 1}
             AND organization_id = $${parameters.length}`,
          parameters,
        );
      }
      const row = await this.selectById(client, organizationId, pipelineId);
      if (!row) throw new Error('Pipeline disappeared inside its transaction');
      return { kind: 'updated', row };
    });
  }

  async delete(
    organizationId: number,
    pipelineId: number,
  ): Promise<DeletePipelineOutcome> {
    return this.transaction(async (client) => {
      const current = await client.query(
        `SELECT id
         FROM pipelines
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [pipelineId, organizationId],
      );
      if (current.rows.length === 0) return { kind: 'not_found' };
      const deals = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM deals
         WHERE pipeline_id = $1 AND organization_id = $2`,
        [pipelineId, organizationId],
      );
      if ((deals.rows[0]?.total ?? 0) > 0) return { kind: 'has_deals' };
      await client.query(
        'DELETE FROM pipelines WHERE id = $1 AND organization_id = $2',
        [pipelineId, organizationId],
      );
      return { kind: 'deleted' };
    });
  }

  private async selectById(
    client: PoolClient,
    organizationId: number,
    pipelineId: number,
  ): Promise<PipelineRow | null> {
    const result = await client.query<PipelineRow>(
      `SELECT ${pipelineSelection}
       FROM pipelines p
       LEFT JOIN deals d
         ON d.pipeline_id = p.id
        AND d.organization_id = p.organization_id
       WHERE p.organization_id = $1 AND p.id = $2
       GROUP BY p.id`,
      [organizationId, pipelineId],
    );
    return result.rows[0] ?? null;
  }

  private async clearOtherDefaults(
    client: PoolClient,
    organizationId: number,
    exceptPipelineId?: number,
  ): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
    if (exceptPipelineId === undefined) {
      await client.query(
        'UPDATE pipelines SET is_default = false WHERE organization_id = $1',
        [organizationId],
      );
      return;
    }
    await client.query(
      `UPDATE pipelines
       SET is_default = false
       WHERE organization_id = $1 AND id <> $2`,
      [organizationId, exceptPipelineId],
    );
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
