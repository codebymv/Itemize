import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type WorkflowRow = {
  id: number; organization_id: number; name: string; description: string | null;
  trigger_type: string; trigger_config: unknown; scheduled_contact_id: number | null;
  next_trigger_at: Date | null; last_triggered_at: Date | null; is_active: boolean;
  stats: unknown; created_by: number | null; created_by_name: string | null;
  created_at: Date; updated_at: Date; step_count: string; active_enrollments: string;
  active_count: string; completed_count: string; failed_count: string; total_count: string;
};

export type WorkflowStepRow = {
  id: number; workflow_id: number; step_order: number; step_type: string;
  step_config: unknown; condition_config: unknown | null; true_branch_step: number | null;
  false_branch_step: number | null; created_at: Date; updated_at: Date;
};

export type WorkflowValue = { workflow: WorkflowRow; steps: WorkflowStepRow[]; affectedEnrollments?: number };
export type WorkflowStepValue = {
  stepType: string; stepConfig: Record<string, unknown>; conditionConfig: Record<string, unknown> | null;
  trueBranchStep: number | null; falseBranchStep: number | null;
};
export type ScheduleValue = { contactId: number | null; nextTriggerAt: Date | null };
export type WorkflowLimit = { current: number; limit: number; plan: string };

type CreateValues = {
  name: string; description: string | null; triggerType: string;
  triggerConfig: Record<string, unknown>; schedule: ScheduleValue; steps: WorkflowStepValue[];
};
type UpdateValues = Partial<Omit<CreateValues, 'schedule' | 'steps'>> & {
  steps?: WorkflowStepValue[];
  scheduleFor: (triggerType: string, triggerConfig: Record<string, unknown>) => ScheduleValue;
};

const workflowColumns = (alias = 'w') => `
  ${alias}.id, ${alias}.organization_id, ${alias}.name, ${alias}.description,
  ${alias}.trigger_type, ${alias}.trigger_config, ${alias}.scheduled_contact_id,
  ${alias}.next_trigger_at, ${alias}.last_triggered_at, ${alias}.is_active,
  ${alias}.stats, ${alias}.created_by, ${alias}.created_at, ${alias}.updated_at`;

const aggregateColumns = `
  (SELECT COUNT(*) FROM workflow_steps ws WHERE ws.workflow_id = w.id) AS step_count,
  (SELECT COUNT(*) FROM workflow_enrollments we WHERE we.workflow_id = w.id AND we.status = 'active') AS active_enrollments,
  (SELECT COUNT(*) FROM workflow_enrollments we WHERE we.workflow_id = w.id AND we.status = 'active') AS active_count,
  (SELECT COUNT(*) FROM workflow_enrollments we WHERE we.workflow_id = w.id AND we.status = 'completed') AS completed_count,
  (SELECT COUNT(*) FROM workflow_enrollments we WHERE we.workflow_id = w.id AND we.status = 'failed') AS failed_count,
  (SELECT COUNT(*) FROM workflow_enrollments we WHERE we.workflow_id = w.id) AS total_count`;

@Injectable()
export class WorkflowsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(criteria: {
    organizationId: number; triggerType?: string; isActive?: boolean; searchPattern?: string;
    pageSize: number; offset: number;
  }): Promise<{ rows: WorkflowRow[]; total: string }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['w.organization_id = $1'];
    if (criteria.triggerType !== undefined) {
      parameters.push(criteria.triggerType); clauses.push(`w.trigger_type = $${parameters.length}`);
    }
    if (criteria.isActive !== undefined) {
      parameters.push(criteria.isActive); clauses.push(`w.is_active = $${parameters.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      parameters.push(criteria.searchPattern);
      clauses.push(`(w.name ILIKE $${parameters.length} ESCAPE '\\' OR COALESCE(w.description, '') ILIKE $${parameters.length} ESCAPE '\\')`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM workflows w WHERE ${where}`, parameters);
    parameters.push(criteria.pageSize, criteria.offset);
    const result = await this.pool.query<WorkflowRow>(
      `SELECT ${workflowColumns()}, u.name AS created_by_name, ${aggregateColumns}
       FROM workflows w LEFT JOIN users u ON u.id = w.created_by
       WHERE ${where} ORDER BY w.updated_at DESC, w.id DESC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return { rows: result.rows, total: count.rows[0]?.total ?? '0' };
  }

  async findById(organizationId: number, id: number): Promise<WorkflowValue | null> {
    const client = await this.pool.connect();
    try { return await this.selectById(client, organizationId, id); } finally { client.release(); }
  }

  async create(organizationId: number, userId: number, values: CreateValues): Promise<
    { kind: 'created'; value: WorkflowValue } | { kind: 'limit'; limit: WorkflowLimit } | { kind: 'contact' }
  > {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const limit = await this.workflowLimit(client, organizationId);
      if (limit.limit !== -1 && limit.current >= limit.limit) return { kind: 'limit', limit };
      if (!(await this.contactExists(client, organizationId, values.schedule.contactId))) return { kind: 'contact' };
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO workflows (
           organization_id, name, description, trigger_type, trigger_config,
           scheduled_contact_id, next_trigger_at, created_by
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id`,
        [organizationId, values.name, values.description, values.triggerType,
          JSON.stringify(values.triggerConfig), values.schedule.contactId,
          values.schedule.nextTriggerAt, userId],
      );
      await this.insertSteps(client, inserted.rows[0].id, values.steps);
      const created = await this.selectById(client, organizationId, inserted.rows[0].id);
      if (!created) throw new Error('Created workflow could not be reloaded');
      return { kind: 'created', value: created };
    });
  }

  async update(organizationId: number, id: number, values: UpdateValues): Promise<
    { kind: 'updated'; value: WorkflowValue } | { kind: 'not_found' } | { kind: 'contact' }
  > {
    return this.transaction(async (client) => {
      const existing = await client.query<WorkflowRow>(
        `SELECT ${workflowColumns('workflows')} FROM workflows
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [id, organizationId],
      );
      const row = existing.rows[0];
      if (!row) return { kind: 'not_found' };
      const triggerType = values.triggerType ?? row.trigger_type;
      const triggerConfig = values.triggerConfig ?? this.record(row.trigger_config);
      const schedule = values.scheduleFor(triggerType, triggerConfig);
      if (!(await this.contactExists(client, organizationId, schedule.contactId))) return { kind: 'contact' };
      const scheduleChanged = triggerType !== row.trigger_type ||
        JSON.stringify(triggerConfig) !== JSON.stringify(this.record(row.trigger_config));
      await client.query(
        `UPDATE workflows SET name = $3, description = $4, trigger_type = $5,
           trigger_config = $6::jsonb, scheduled_contact_id = $7, next_trigger_at = $8,
           last_triggered_at = CASE WHEN $9 THEN NULL ELSE last_triggered_at END,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, values.name ?? row.name,
          values.description === undefined ? row.description : values.description,
          triggerType, JSON.stringify(triggerConfig), schedule.contactId,
          scheduleChanged ? schedule.nextTriggerAt : row.next_trigger_at, scheduleChanged],
      );
      if (values.steps !== undefined) {
        await client.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [id]);
        await this.insertSteps(client, id, values.steps);
      }
      const updated = await this.selectById(client, organizationId, id);
      if (!updated) throw new Error('Updated workflow could not be reloaded');
      return { kind: 'updated', value: updated };
    });
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<
    { kind: 'duplicated'; value: WorkflowValue } | { kind: 'not_found' } | { kind: 'limit'; limit: WorkflowLimit }
  > {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const limit = await this.workflowLimit(client, organizationId);
      if (limit.limit !== -1 && limit.current >= limit.limit) return { kind: 'limit', limit };
      const source = await client.query<WorkflowRow>(
        `SELECT ${workflowColumns('workflows')} FROM workflows
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [id, organizationId],
      );
      const row = source.rows[0];
      if (!row) return { kind: 'not_found' };
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO workflows (
           organization_id, name, description, trigger_type, trigger_config,
           scheduled_contact_id, next_trigger_at, is_active, created_by
         ) VALUES ($1, LEFT($2, 248) || ' (Copy)', $3, $4, $5::jsonb, $6, $7, FALSE, $8)
         RETURNING id`,
        [organizationId, row.name, row.description, row.trigger_type,
          JSON.stringify(this.record(row.trigger_config)), row.scheduled_contact_id,
          row.next_trigger_at, userId],
      );
      await client.query(
        `INSERT INTO workflow_steps (
           workflow_id, step_order, step_type, step_config, condition_config,
           true_branch_step, false_branch_step
         ) SELECT $2, step_order, step_type, step_config, condition_config,
             true_branch_step, false_branch_step
           FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`,
        [id, inserted.rows[0].id],
      );
      const duplicated = await this.selectById(client, organizationId, inserted.rows[0].id);
      if (!duplicated) throw new Error('Duplicated workflow could not be reloaded');
      return { kind: 'duplicated', value: duplicated };
    });
  }

  async setActive(organizationId: number, id: number, active: boolean): Promise<
    { kind: 'updated'; value: WorkflowValue } | { kind: 'not_found' } | { kind: 'no_steps' } | { kind: 'schedule' }
  > {
    return this.transaction(async (client) => {
      const owned = await client.query<WorkflowRow>(
        `SELECT ${workflowColumns('workflows')} FROM workflows
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [id, organizationId],
      );
      const row = owned.rows[0];
      if (!row) return { kind: 'not_found' };
      if (active) {
        const step = await client.query('SELECT 1 FROM workflow_steps WHERE workflow_id = $1 LIMIT 1', [id]);
        if (step.rows.length === 0) return { kind: 'no_steps' };
        if (row.trigger_type === 'scheduled' && (!row.scheduled_contact_id || !row.next_trigger_at)) return { kind: 'schedule' };
      }
      await client.query(
        `UPDATE workflows SET is_active = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`, [id, organizationId, active],
      );
      const enrollment = active
        ? await client.query(
          `UPDATE workflow_enrollments SET status = 'active', pause_reason = NULL,
             paused_at = NULL, execution_claim_token = NULL, execution_lease_expires_at = NULL,
             next_action_at = COALESCE(next_action_at, CURRENT_TIMESTAMP)
           WHERE workflow_id = $1 AND status = 'paused' AND pause_reason = 'workflow_deactivated'
           RETURNING id`, [id])
        : await client.query(
          `UPDATE workflow_enrollments SET status = 'paused', pause_reason = 'workflow_deactivated',
             paused_at = CURRENT_TIMESTAMP, execution_claim_token = NULL, execution_lease_expires_at = NULL
           WHERE workflow_id = $1 AND status = 'active' RETURNING id`, [id]);
      const updated = await this.selectById(client, organizationId, id);
      if (!updated) throw new Error('Workflow lifecycle update could not be reloaded');
      updated.affectedEnrollments = enrollment.rows.length;
      return { kind: 'updated', value: updated };
    });
  }

  async delete(organizationId: number, id: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM workflows WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId],
    );
    return result.rows.length === 1;
  }

  private async selectById(client: PoolClient, organizationId: number, id: number): Promise<WorkflowValue | null> {
    const workflow = await client.query<WorkflowRow>(
      `SELECT ${workflowColumns()}, u.name AS created_by_name, ${aggregateColumns}
       FROM workflows w LEFT JOIN users u ON u.id = w.created_by
       WHERE w.id = $1 AND w.organization_id = $2`, [id, organizationId],
    );
    if (!workflow.rows[0]) return null;
    const steps = await client.query<WorkflowStepRow>(
      `SELECT id, workflow_id, step_order, step_type, step_config, condition_config,
         true_branch_step, false_branch_step, created_at, updated_at
       FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`, [id],
    );
    return { workflow: workflow.rows[0], steps: steps.rows };
  }

  private async insertSteps(client: PoolClient, workflowId: number, steps: WorkflowStepValue[]): Promise<void> {
    for (const [index, step] of steps.entries()) {
      await client.query(
        `INSERT INTO workflow_steps (
           workflow_id, step_order, step_type, step_config, condition_config,
           true_branch_step, false_branch_step
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
        [workflowId, index + 1, step.stepType, JSON.stringify(step.stepConfig),
          step.conditionConfig === null ? null : JSON.stringify(step.conditionConfig),
          step.trueBranchStep, step.falseBranchStep],
      );
    }
  }

  private async workflowLimit(client: PoolClient, organizationId: number): Promise<WorkflowLimit> {
    const result = await client.query<{ plan: string | null; workflows_limit: number | null; current: string }>(
      `SELECT o.plan, o.workflows_limit,
         (SELECT COUNT(*) FROM workflows w WHERE w.organization_id = o.id) AS current
       FROM organizations o WHERE o.id = $1`, [organizationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Verified organization disappeared during workflow write');
    return { plan: row.plan ?? 'starter', limit: row.workflows_limit ?? 5, current: Number(row.current) };
  }

  private async contactExists(client: PoolClient, organizationId: number, contactId: number | null): Promise<boolean> {
    if (contactId === null) return true;
    const result = await client.query('SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2', [contactId, organizationId]);
    return result.rows.length === 1;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
    } finally { client.release(); }
  }
}
