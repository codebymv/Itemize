import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type WorkflowEnrollmentRow = {
  id: number; workflow_id: number; contact_id: number; current_step: number; status: string;
  trigger_data: unknown; context: unknown; error_message: string | null; enrolled_at: Date;
  next_action_at: Date | null; completed_at: Date | null; execution_attempt_count: number;
  execution_claim_token: string | null; execution_lease_expires_at: Date | null;
  pause_reason: string | null; paused_at: Date | null; first_name?: string | null;
  last_name?: string | null; email?: string | null; company?: string | null;
};
export type EnrollmentValue = { row: WorkflowEnrollmentRow; affectedSideEffects?: number };

const columns = (alias = 'we') => `
  ${alias}.id, ${alias}.workflow_id, ${alias}.contact_id, ${alias}.current_step,
  ${alias}.status, ${alias}.trigger_data, ${alias}.context, ${alias}.error_message,
  ${alias}.enrolled_at, ${alias}.next_action_at, ${alias}.completed_at,
  ${alias}.execution_attempt_count, ${alias}.execution_claim_token,
  ${alias}.execution_lease_expires_at, ${alias}.pause_reason, ${alias}.paused_at`;

@Injectable()
export class WorkflowEnrollmentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(criteria: {
    organizationId: number; workflowId: number; status?: string; pageSize: number; offset: number;
  }): Promise<{ kind: 'ok'; rows: WorkflowEnrollmentRow[]; total: string } | { kind: 'not_found' }> {
    const client = await this.pool.connect();
    try {
      const workflow = await client.query(
        'SELECT 1 FROM workflows WHERE id = $1 AND organization_id = $2',
        [criteria.workflowId, criteria.organizationId],
      );
      if (workflow.rows.length === 0) return { kind: 'not_found' };
      const parameters: unknown[] = [criteria.workflowId, criteria.organizationId];
      const clauses = [
        'we.workflow_id = $1', 'w.organization_id = $2', 'c.organization_id = $2',
      ];
      if (criteria.status !== undefined) {
        parameters.push(criteria.status); clauses.push(`we.status = $${parameters.length}`);
      }
      const where = clauses.join(' AND ');
      const count = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM workflow_enrollments we
         JOIN workflows w ON w.id = we.workflow_id
         JOIN contacts c ON c.id = we.contact_id WHERE ${where}`,
        parameters,
      );
      parameters.push(criteria.pageSize, criteria.offset);
      const rows = await client.query<WorkflowEnrollmentRow>(
        `SELECT ${columns()}, c.first_name, c.last_name, c.email, c.company
         FROM workflow_enrollments we
         JOIN workflows w ON w.id = we.workflow_id
         JOIN contacts c ON c.id = we.contact_id
         WHERE ${where} ORDER BY we.enrolled_at DESC, we.id DESC
         LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
        parameters,
      );
      return { kind: 'ok', rows: rows.rows, total: count.rows[0]?.total ?? '0' };
    } finally { client.release(); }
  }

  async enroll(
    organizationId: number,
    workflowId: number,
    contactId: number,
    triggerData: Record<string, unknown>,
  ): Promise<
    { kind: 'ok'; value: EnrollmentValue; created: boolean } |
    { kind: 'workflow_not_found' } | { kind: 'contact_not_found' } | { kind: 'conflict' }
  > {
    return this.transaction(async (client) => {
      const workflow = await client.query(
        'SELECT id FROM workflows WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [workflowId, organizationId],
      );
      if (workflow.rows.length === 0) return { kind: 'workflow_not_found' };
      const contact = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
        [contactId, organizationId],
      );
      if (contact.rows.length === 0) return { kind: 'contact_not_found' };
      const existing = await client.query<WorkflowEnrollmentRow>(
        `SELECT ${columns()} FROM workflow_enrollments we
         WHERE we.workflow_id = $1 AND we.contact_id = $2 FOR UPDATE`,
        [workflowId, contactId],
      );
      if (existing.rows[0] && ['active', 'paused'].includes(existing.rows[0].status)) return { kind: 'conflict' };
      if (existing.rows[0]) {
        const updated = await client.query<WorkflowEnrollmentRow>(
          `UPDATE workflow_enrollments we SET status = 'active', current_step = 1,
             enrolled_at = CURRENT_TIMESTAMP, trigger_data = $2::jsonb, context = '{}'::jsonb,
             error_message = NULL, completed_at = NULL, next_action_at = CURRENT_TIMESTAMP,
             execution_attempt_count = 0, execution_claim_token = NULL,
             execution_lease_expires_at = NULL, pause_reason = NULL, paused_at = NULL
           WHERE we.id = $1 RETURNING ${columns('we')}`,
          [existing.rows[0].id, JSON.stringify(triggerData)],
        );
        return { kind: 'ok', value: { row: updated.rows[0] }, created: false };
      }
      const inserted = await client.query<WorkflowEnrollmentRow>(
        `INSERT INTO workflow_enrollments (
           workflow_id, contact_id, trigger_data, status, current_step, next_action_at
         ) VALUES ($1, $2, $3::jsonb, 'active', 1, CURRENT_TIMESTAMP)
         RETURNING ${columns('workflow_enrollments')}`,
        [workflowId, contactId, JSON.stringify(triggerData)],
      );
      await client.query(
        `UPDATE workflows SET stats = jsonb_set(
           COALESCE(stats, '{}'::jsonb), '{enrolled}',
           (COALESCE((stats->>'enrolled')::int, 0) + 1)::text::jsonb
         ) WHERE id = $1 AND organization_id = $2`,
        [workflowId, organizationId],
      );
      return { kind: 'ok', value: { row: inserted.rows[0] }, created: true };
    });
  }

  async transition(
    organizationId: number,
    workflowId: number,
    enrollmentId: number,
    action: 'pause' | 'resume' | 'retry',
  ): Promise<{ kind: 'ok'; value: EnrollmentValue } | { kind: 'not_found' } | { kind: 'invalid' }> {
    return this.transaction(async (client) => {
      const selected = await client.query<WorkflowEnrollmentRow & { workflow_active: boolean }>(
        `SELECT ${columns()}, w.is_active AS workflow_active
         FROM workflow_enrollments we JOIN workflows w ON w.id = we.workflow_id
         WHERE we.id = $1 AND we.workflow_id = $2 AND w.organization_id = $3
         FOR UPDATE OF we`,
        [enrollmentId, workflowId, organizationId],
      );
      const row = selected.rows[0];
      if (!row) return { kind: 'not_found' };
      const allowed = action === 'pause'
        ? row.status === 'active'
        : action === 'resume'
          ? row.status === 'paused' && row.pause_reason === 'manual' && row.workflow_active
          : row.status === 'failed' && row.workflow_active;
      if (!allowed) return { kind: 'invalid' };
      const update = action === 'pause'
        ? `status = 'paused', pause_reason = 'manual', paused_at = CURRENT_TIMESTAMP,
           execution_claim_token = NULL, execution_lease_expires_at = NULL`
        : action === 'resume'
          ? `status = 'active', pause_reason = NULL, paused_at = NULL,
             next_action_at = COALESCE(next_action_at, CURRENT_TIMESTAMP),
             execution_claim_token = NULL, execution_lease_expires_at = NULL`
          : `status = 'active', error_message = NULL, completed_at = NULL,
             next_action_at = CURRENT_TIMESTAMP, execution_attempt_count = 0,
             execution_claim_token = NULL, execution_lease_expires_at = NULL,
             pause_reason = NULL, paused_at = NULL`;
      const updated = await client.query<WorkflowEnrollmentRow>(
        `UPDATE workflow_enrollments we SET ${update}
         WHERE we.id = $1 RETURNING ${columns('we')}`,
        [enrollmentId],
      );
      return { kind: 'ok', value: { row: updated.rows[0] } };
    });
  }

  async cancel(
    organizationId: number,
    workflowId: number,
    enrollmentId: number,
  ): Promise<{ kind: 'ok'; value: EnrollmentValue } | { kind: 'not_found' }> {
    return this.transaction(async (client) => {
      const selected = await client.query<WorkflowEnrollmentRow>(
        `SELECT ${columns()} FROM workflow_enrollments we
         JOIN workflows w ON w.id = we.workflow_id
         WHERE we.id = $1 AND we.workflow_id = $2 AND w.organization_id = $3
         FOR UPDATE OF we`,
        [enrollmentId, workflowId, organizationId],
      );
      if (!selected.rows[0]) return { kind: 'not_found' };
      const enrollment = await client.query<WorkflowEnrollmentRow>(
        `UPDATE workflow_enrollments we SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP,
           next_action_at = NULL, execution_claim_token = NULL, execution_lease_expires_at = NULL
         WHERE we.id = $1 RETURNING ${columns('we')}`,
        [enrollmentId],
      );
      const sideEffects = await client.query(
        `UPDATE workflow_side_effect_outbox SET
           status = CASE WHEN status = 'processing' THEN status ELSE 'cancelled' END,
           cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = 'enrollment_cancelled',
           next_attempt_at = CASE WHEN status = 'processing' THEN next_attempt_at ELSE NULL END,
           lease_expires_at = CASE WHEN status = 'processing' THEN lease_expires_at ELSE NULL END
         WHERE enrollment_id = $1 AND status IN (
           'queued', 'retry', 'processing', 'dead_letter', 'reconciliation_required'
         ) RETURNING id`,
        [enrollmentId],
      );
      return { kind: 'ok', value: { row: enrollment.rows[0], affectedSideEffects: sideEffects.rows.length } };
    });
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
