import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  DealSortDirection,
  DealSortField,
  DealStatus,
} from './deal.enums';

export type DealRow = {
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
  contact_company: string | null;
  pipeline_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type DealCriteria = {
  organizationId: number;
  pipelineId?: number;
  stageId?: string;
  contactId?: number;
  assignedToId?: number;
  status?: DealStatus;
  sortField: DealSortField;
  sortDirection: DealSortDirection;
  pageSize: number;
  offset: number;
};

export type DealValues = {
  pipelineId: number;
  contactId: number | null;
  stageId?: string;
  title: string;
  value: string;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  assignedToId: number | null;
  customFields: Record<string, unknown>;
  tags: string[];
};

export type DealUpdates = Partial<DealValues>;

export type DealWriteOutcome =
  | { kind: 'ok'; row: DealRow }
  | { kind: 'not_found' }
  | { kind: 'pipeline_not_found' }
  | { kind: 'invalid_stage' }
  | { kind: 'invalid_contact' }
  | { kind: 'invalid_assignee' };

type ReferenceOutcome =
  | { kind: 'ok'; firstStageId: string }
  | Exclude<DealWriteOutcome, { kind: 'ok'; row: DealRow } | { kind: 'not_found' }>;

const dealSelection = `
  d.id, d.organization_id, d.pipeline_id, d.contact_id, d.stage_id,
  d.title, d.value::text, d.currency, d.probability, d.expected_close_date,
  d.assigned_to, member_user.name AS assigned_to_name, d.created_by,
  d.won_at, d.lost_at, d.lost_reason, d.custom_fields, d.tags,
  contact.first_name AS contact_first_name,
  contact.last_name AS contact_last_name,
  contact.email AS contact_email,
  contact.company AS contact_company,
  pipeline.name AS pipeline_name,
  d.created_at, d.updated_at`;

const sortColumns: Record<DealSortField, string> = {
  [DealSortField.CREATED_AT]: 'd.created_at',
  [DealSortField.EXPECTED_CLOSE_DATE]: 'd.expected_close_date',
  [DealSortField.TITLE]: 'lower(d.title)',
  [DealSortField.UPDATED_AT]: 'd.updated_at',
  [DealSortField.VALUE]: 'd.value',
};

@Injectable()
export class DealsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(criteria: DealCriteria): Promise<{ rows: DealRow[]; total: number }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['d.organization_id = $1'];
    const add = (sql: string, value: unknown) => {
      parameters.push(value);
      clauses.push(`${sql} $${parameters.length}`);
    };
    if (criteria.pipelineId !== undefined) add('d.pipeline_id =', criteria.pipelineId);
    if (criteria.stageId !== undefined) add('d.stage_id =', criteria.stageId);
    if (criteria.contactId !== undefined) add('d.contact_id =', criteria.contactId);
    if (criteria.assignedToId !== undefined) add('d.assigned_to =', criteria.assignedToId);
    if (criteria.status === DealStatus.OPEN) {
      clauses.push('d.won_at IS NULL AND d.lost_at IS NULL');
    } else if (criteria.status === DealStatus.WON) {
      clauses.push('d.won_at IS NOT NULL');
    } else if (criteria.status === DealStatus.LOST) {
      clauses.push('d.lost_at IS NOT NULL');
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM deals d WHERE ${where}`,
      parameters,
    );
    const direction = criteria.sortDirection === DealSortDirection.ASC ? 'ASC' : 'DESC';
    const sort = sortColumns[criteria.sortField];
    const rows = await this.pool.query<DealRow>(
      `SELECT ${dealSelection}
       ${this.joins()}
       WHERE ${where}
       ORDER BY ${sort} ${direction} NULLS LAST, d.id ${direction}
       LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
      [...parameters, criteria.pageSize, criteria.offset],
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findById(organizationId: number, dealId: number): Promise<DealRow | null> {
    const result = await this.pool.query<DealRow>(
      `SELECT ${dealSelection}
       ${this.joins()}
       WHERE d.organization_id = $1 AND d.id = $2`,
      [organizationId, dealId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    organizationId: number,
    userId: number,
    values: DealValues,
  ): Promise<DealWriteOutcome> {
    return this.transaction(async (client) => {
      const references = await this.validateReferences(client, organizationId, values);
      if (references.kind !== 'ok') return references;
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO deals (
           organization_id, pipeline_id, contact_id, stage_id, title,
           value, currency, probability, expected_close_date,
           assigned_to, created_by, custom_fields, tags
         ) VALUES (
           $1, $2, $3, $4, $5, $6::numeric, $7, $8, $9::date,
           $10, $11, $12::jsonb, $13::text[]
         ) RETURNING id`,
        [
          organizationId,
          values.pipelineId,
          values.contactId,
          values.stageId ?? references.firstStageId,
          values.title,
          values.value,
          values.currency,
          values.probability,
          values.expectedCloseDate,
          values.assignedToId,
          userId,
          JSON.stringify(values.customFields),
          values.tags,
        ],
      );
      return {
        kind: 'ok',
        row: await this.requireSelected(client, organizationId, Number(inserted.rows[0].id)),
      };
    });
  }

  async update(
    organizationId: number,
    userId: number,
    dealId: number,
    updates: DealUpdates,
  ): Promise<DealWriteOutcome> {
    return this.transaction(async (client) => {
      const current = await this.lock(client, organizationId, dealId);
      if (!current) return { kind: 'not_found' };
      const pipelineChanged =
        updates.pipelineId !== undefined && updates.pipelineId !== current.pipeline_id;
      const targetPipelineId = updates.pipelineId ?? current.pipeline_id;
      const requestedStage = updates.stageId ?? (pipelineChanged ? undefined : current.stage_id);
      const references = await this.validateReferences(client, organizationId, {
        pipelineId: targetPipelineId,
        contactId: updates.contactId,
        stageId: requestedStage,
        assignedToId: updates.assignedToId,
      });
      if (references.kind !== 'ok') return references;
      const targetStageId = requestedStage ?? references.firstStageId;
      const clauses: string[] = [];
      const parameters: unknown[] = [];
      const set = (column: string, value: unknown, cast = '') => {
        parameters.push(value);
        clauses.push(`${column} = $${parameters.length}${cast}`);
      };
      if (updates.pipelineId !== undefined) set('pipeline_id', targetPipelineId);
      if (updates.contactId !== undefined) set('contact_id', updates.contactId);
      if (updates.stageId !== undefined || pipelineChanged) set('stage_id', targetStageId);
      if (updates.title !== undefined) set('title', updates.title);
      if (updates.value !== undefined) set('value', updates.value, '::numeric');
      if (updates.currency !== undefined) set('currency', updates.currency);
      if (updates.probability !== undefined) set('probability', updates.probability);
      if (updates.expectedCloseDate !== undefined) {
        set('expected_close_date', updates.expectedCloseDate, '::date');
      }
      if (updates.assignedToId !== undefined) set('assigned_to', updates.assignedToId);
      if (updates.customFields !== undefined) {
        set('custom_fields', JSON.stringify(updates.customFields), '::jsonb');
      }
      if (updates.tags !== undefined) set('tags', updates.tags, '::text[]');
      if (clauses.length > 0) {
        parameters.push(dealId, organizationId);
        await client.query(
          `UPDATE deals SET ${clauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $${parameters.length - 1} AND organization_id = $${parameters.length}`,
          parameters,
        );
      }
      const row = await this.requireSelected(client, organizationId, dealId);
      if (
        current.pipeline_id !== row.pipeline_id ||
        String(current.stage_id) !== String(row.stage_id)
      ) {
        await this.recordTransition(client, userId, row, {
          kind: 'stage_changed',
          triggerType: 'deal_stage_changed',
          fromStageId: current.stage_id,
          toStageId: row.stage_id,
          metadata: {
            oldPipelineId: current.pipeline_id,
            newPipelineId: row.pipeline_id,
          },
        });
      }
      return { kind: 'ok', row };
    });
  }

  async move(
    organizationId: number,
    userId: number,
    dealId: number,
    stageId: string,
  ): Promise<DealWriteOutcome> {
    return this.transaction(async (client) => {
      const current = await this.lock(client, organizationId, dealId);
      if (!current) return { kind: 'not_found' };
      const references = await this.validateReferences(client, organizationId, {
        pipelineId: current.pipeline_id,
        stageId,
      });
      if (references.kind !== 'ok') return references;
      if (current.stage_id !== stageId) {
        await client.query(
          `UPDATE deals SET stage_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [stageId, dealId, organizationId],
        );
      }
      const row = await this.requireSelected(client, organizationId, dealId);
      if (current.stage_id !== row.stage_id) {
        await this.recordTransition(client, userId, row, {
          kind: 'stage_changed',
          triggerType: 'deal_stage_changed',
          fromStageId: current.stage_id,
          toStageId: row.stage_id,
          metadata: {},
        });
      }
      return { kind: 'ok', row };
    });
  }

  async lifecycle(
    organizationId: number,
    userId: number,
    dealId: number,
    target: 'won' | 'lost' | 'open',
    reason: string | null = null,
  ): Promise<DealWriteOutcome> {
    return this.transaction(async (client) => {
      const current = await this.lock(client, organizationId, dealId);
      if (!current) return { kind: 'not_found' };
      const previous = current.won_at ? 'won' : current.lost_at ? 'lost' : 'open';
      await client.query(
        `UPDATE deals SET
           won_at = CASE WHEN $1 = 'won' THEN CURRENT_TIMESTAMP ELSE NULL END,
           lost_at = CASE WHEN $1 = 'lost' THEN CURRENT_TIMESTAMP ELSE NULL END,
           lost_reason = CASE WHEN $1 = 'lost' THEN $2 ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND organization_id = $4`,
        [target, reason, dealId, organizationId],
      );
      const row = await this.requireSelected(client, organizationId, dealId);
      if (previous !== target) {
        const kind = target === 'open' ? 'reopened' : target;
        await this.recordTransition(client, userId, row, {
          kind,
          triggerType: `deal_${kind}`,
          fromState: previous,
          toState: target,
          metadata: target === 'lost' && reason ? { reason } : {},
        });
      }
      return { kind: 'ok', row };
    });
  }

  async delete(organizationId: number, dealId: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM deals WHERE id = $1 AND organization_id = $2 RETURNING id',
      [dealId, organizationId],
    );
    return result.rowCount === 1;
  }

  private async validateReferences(
    client: PoolClient,
    organizationId: number,
    values: {
      pipelineId: number;
      stageId?: string;
      contactId?: number | null;
      assignedToId?: number | null;
    },
  ): Promise<ReferenceOutcome> {
    const pipeline = await client.query<{ first_stage_id: string }>(
      `SELECT (
         SELECT stage_key FROM pipeline_stages
         WHERE pipeline_id = p.id ORDER BY stage_order, id LIMIT 1
       ) AS first_stage_id
       FROM pipelines p
       WHERE p.id = $1 AND p.organization_id = $2
       FOR KEY SHARE`,
      [values.pipelineId, organizationId],
    );
    if (!pipeline.rows[0]) return { kind: 'pipeline_not_found' };
    if (values.stageId !== undefined) {
      const stage = await client.query(
        `SELECT 1 FROM pipeline_stages
         WHERE pipeline_id = $1 AND stage_key = $2`,
        [values.pipelineId, values.stageId],
      );
      if (stage.rowCount !== 1) return { kind: 'invalid_stage' };
    }
    if (values.contactId !== undefined && values.contactId !== null) {
      const contact = await client.query(
        'SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2',
        [values.contactId, organizationId],
      );
      if (contact.rowCount !== 1) return { kind: 'invalid_contact' };
    }
    if (values.assignedToId !== undefined && values.assignedToId !== null) {
      const member = await client.query(
        `SELECT 1 FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, values.assignedToId],
      );
      if (member.rowCount !== 1) return { kind: 'invalid_assignee' };
    }
    return { kind: 'ok', firstStageId: pipeline.rows[0].first_stage_id };
  }

  private async lock(
    client: PoolClient,
    organizationId: number,
    dealId: number,
  ): Promise<DealRow | null> {
    const result = await client.query<DealRow>(
      `SELECT d.* FROM deals d
       WHERE d.id = $1 AND d.organization_id = $2 FOR UPDATE`,
      [dealId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async recordTransition(
    client: PoolClient,
    userId: number,
    row: DealRow,
    transition: {
      kind: string;
      triggerType: string;
      fromStageId?: string;
      toStageId?: string;
      fromState?: string;
      toState?: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const payload = {
      deal_id: Number(row.id),
      pipeline_id: Number(row.pipeline_id),
      fromStageId: transition.fromStageId ?? null,
      newStageId: transition.toStageId ?? null,
      fromState: transition.fromState ?? null,
      newState: transition.toState ?? null,
      ...transition.metadata,
    };
    await client.query(
      `INSERT INTO deal_activities (
         organization_id, deal_id, contact_id, user_id, kind,
         from_stage_id, to_stage_id, from_state, to_state, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        row.organization_id,
        row.id,
        row.contact_id,
        userId,
        transition.kind,
        transition.fromStageId ?? null,
        transition.toStageId ?? null,
        transition.fromState ?? null,
        transition.toState ?? null,
        JSON.stringify(transition.metadata),
      ],
    );
    if (row.contact_id !== null) {
      await client.query(
        `INSERT INTO contact_activities (
           contact_id, user_id, type, title, content, metadata
         ) VALUES ($1, $2, 'deal_update', $3, $4::jsonb, $5::jsonb)`,
        [
          row.contact_id,
          userId,
          `Deal ${transition.kind.replaceAll('_', ' ')}`,
          JSON.stringify(payload),
          JSON.stringify({ dealId: Number(row.id), kind: transition.kind }),
        ],
      );
    }
    await client.query(
      `INSERT INTO workflow_triggers (
         workflow_id, organization_id, contact_id, trigger_type,
         entity_type, entity_id, payload, status, event_key,
         source, occurred_at, next_attempt_at
       ) VALUES (
         NULL, $1, $2, $3, 'deal', $4, $5::jsonb, 'queued', $6,
         'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`,
      [
        row.organization_id,
        row.contact_id,
        transition.triggerType,
        row.id,
        JSON.stringify(payload),
        `domain:${transition.triggerType}:${randomUUID()}`,
      ],
    );
  }

  private joins(): string {
    return `FROM deals d
      LEFT JOIN contacts contact
        ON contact.id = d.contact_id AND contact.organization_id = d.organization_id
      LEFT JOIN organization_members member
        ON member.organization_id = d.organization_id AND member.user_id = d.assigned_to
      LEFT JOIN users member_user ON member_user.id = member.user_id
      LEFT JOIN pipelines pipeline
        ON pipeline.id = d.pipeline_id AND pipeline.organization_id = d.organization_id`;
  }

  private async requireSelected(
    client: PoolClient,
    organizationId: number,
    dealId: number,
  ): Promise<DealRow> {
    const result = await client.query<DealRow>(
      `SELECT ${dealSelection} ${this.joins()}
       WHERE d.organization_id = $1 AND d.id = $2`,
      [organizationId, dealId],
    );
    if (!result.rows[0]) throw new Error('Deal disappeared inside its transaction');
    return result.rows[0];
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
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
