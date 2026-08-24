import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type SummaryRow = Record<string, unknown>;
export type SideEffectRow = Record<string, unknown>;

@Injectable()
export class WorkflowExecutionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async summary(organizationId: number, workflowId: number): Promise<
    { kind: 'not_found' } | { kind: 'ok'; sideEffects: SummaryRow; enrollments: SummaryRow }
  > {
    const client = await this.pool.connect();
    try {
      if (!await this.ownedWorkflow(client, organizationId, workflowId)) return { kind: 'not_found' };
      const sideEffects = await client.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.status = 'queued')::int AS queued_count,
          COUNT(*) FILTER (WHERE o.status = 'processing')::int AS processing_count,
          COUNT(*) FILTER (WHERE o.status = 'retry')::int AS retry_count,
          COUNT(*) FILTER (WHERE o.status = 'sent')::int AS sent_count,
          COUNT(*) FILTER (WHERE o.status = 'dead_letter')::int AS dead_letter_count,
          COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
          COUNT(*) FILTER (WHERE o.status = 'reconciliation_required')::int AS reconciliation_required_count,
          COUNT(*) FILTER (WHERE o.effect_type = 'email')::int AS email_count,
          COUNT(*) FILTER (WHERE o.effect_type = 'sms')::int AS sms_count,
          COUNT(*) FILTER (WHERE o.effect_type = 'webhook')::int AS webhook_count,
          COUNT(*) FILTER (WHERE o.status IN ('queued','retry') AND COALESCE(o.next_attempt_at,o.created_at) <= NOW())::int AS due_count,
          COUNT(*) FILTER (WHERE o.status = 'processing' AND o.lease_expires_at <= NOW())::int AS expired_processing_count,
          COALESCE(MAX(o.attempt_count),0)::int AS max_attempt_count,
          COALESCE(SUM(o.attempt_count),0)::bigint AS total_attempt_count,
          COALESCE(SUM(o.operator_retry_count),0)::bigint AS operator_retry_count,
          MIN(o.created_at) FILTER (WHERE o.status IN ('queued','retry','processing','reconciliation_required')) AS oldest_pending_at,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - MIN(o.created_at) FILTER (WHERE o.status IN ('queued','retry','processing','reconciliation_required')))))::bigint AS oldest_pending_age_seconds,
          MAX(o.last_operator_retry_at) AS last_operator_retry_at,
          MAX(o.created_at) FILTER (WHERE o.status = 'dead_letter') AS latest_dead_letter_at
        FROM workflow_side_effect_outbox o
        JOIN workflow_enrollments e ON e.id = o.enrollment_id
        WHERE e.workflow_id = $1 AND o.organization_id = $2`, [workflowId, organizationId]);
      const enrollments = await client.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='active')::int AS active_count,
          COUNT(*) FILTER (WHERE status='paused')::int AS paused_count,
          COUNT(*) FILTER (WHERE status='completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE status='failed')::int AS failed_count,
          COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled_count,
          MIN(next_action_at) FILTER (WHERE status='active' AND next_action_at IS NOT NULL) AS oldest_due_at,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - MIN(next_action_at) FILTER (WHERE status='active' AND next_action_at IS NOT NULL AND next_action_at <= NOW()))))::bigint AS oldest_due_age_seconds
        FROM workflow_enrollments WHERE workflow_id = $1`, [workflowId]);
      return { kind: 'ok', sideEffects: sideEffects.rows[0], enrollments: enrollments.rows[0] };
    } finally { client.release(); }
  }

  async findPage(criteria: { organizationId: number; workflowId: number; status?: string; effectType?: string; limit: number; offset: number }): Promise<
    { kind: 'not_found' } | { kind: 'ok'; rows: SideEffectRow[]; total: unknown }
  > {
    const client = await this.pool.connect();
    try {
      if (!await this.ownedWorkflow(client, criteria.organizationId, criteria.workflowId)) return { kind: 'not_found' };
      const params: unknown[] = [criteria.workflowId, criteria.organizationId];
      const filters = ['e.workflow_id=$1', 'o.organization_id=$2'];
      if (criteria.status) { params.push(criteria.status); filters.push(`o.status=$${params.length}`); }
      if (criteria.effectType) { params.push(criteria.effectType); filters.push(`o.effect_type=$${params.length}`); }
      const where = filters.join(' AND ');
      const count = await client.query(`SELECT COUNT(*)::int AS total FROM workflow_side_effect_outbox o JOIN workflow_enrollments e ON e.id=o.enrollment_id WHERE ${where}`, params);
      params.push(criteria.limit, criteria.offset);
      const rows = await client.query(`
        SELECT o.id,o.enrollment_id,o.step_id,s.step_order,s.step_type,o.effect_type,o.status,
          o.attempt_count,o.next_attempt_at,o.lease_expires_at,o.last_error,o.provider_id,
          o.cancelled_at,o.cancellation_reason,o.operator_retry_count,o.last_operator_retry_at,
          o.reconciliation_required_at,o.reconciliation_reason,o.last_reconciled_at,
          o.last_reconciliation_action,o.last_reconciled_by,o.created_at,o.sent_at,
          e.status AS enrollment_status,e.current_step AS enrollment_current_step,
          c.id AS contact_id,c.first_name,c.last_name,
          (o.status IN ('queued','retry') AND COALESCE(o.next_attempt_at,o.created_at) <= NOW()) AS is_due,
          (o.status='processing' AND o.lease_expires_at <= NOW()) AS lease_expired,
          GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (NOW()-o.created_at))))::bigint AS age_seconds
        FROM workflow_side_effect_outbox o JOIN workflow_enrollments e ON e.id=o.enrollment_id
        LEFT JOIN workflow_steps s ON s.id=o.step_id AND s.workflow_id=e.workflow_id
        LEFT JOIN contacts c ON c.id=e.contact_id AND c.organization_id=$2
        WHERE ${where} ORDER BY o.created_at DESC,o.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { kind: 'ok', rows: rows.rows, total: count.rows[0]?.total ?? 0 };
    } finally { client.release(); }
  }

  retry(organizationId: number, workflowId: number, sideEffectId: number): Promise<
    { kind: 'ok'; row: SideEffectRow } | { kind: 'invalid' } | { kind: 'not_found' }
  > {
    return this.transaction(async (client) => {
      if (!await this.ownedWorkflow(client, organizationId, workflowId)) return { kind: 'not_found' };
      const result = await client.query(`UPDATE workflow_side_effect_outbox o SET status='retry',attempt_count=0,
          next_attempt_at=NOW(),lease_expires_at=NULL,operator_retry_count=operator_retry_count+1,last_operator_retry_at=NOW()
        WHERE o.id=$1 AND o.status='dead_letter' AND o.cancelled_at IS NULL AND EXISTS (
          SELECT 1 FROM workflow_enrollments e JOIN workflows w ON w.id=e.workflow_id
          WHERE e.id=o.enrollment_id AND w.id=$2 AND w.organization_id=$3 AND e.status<>'cancelled')
        RETURNING *`, [sideEffectId, workflowId, organizationId]);
      return result.rows[0] ? { kind: 'ok', row: result.rows[0] } : { kind: 'invalid' };
    });
  }

  reconcile(organizationId: number, userId: number, workflowId: number, sideEffectId: number, action: 'accepted'|'resend', providerId?: string): Promise<
    { kind: 'not_found' } | { kind: 'invalid' } | { kind: 'ok'; row: SideEffectRow }
  > {
    return this.transaction(async (client) => {
      if (!await this.ownedWorkflow(client, organizationId, workflowId)) return { kind: 'not_found' };
      const selected = await client.query(`SELECT o.* FROM workflow_side_effect_outbox o
        JOIN workflow_enrollments e ON e.id=o.enrollment_id
        WHERE o.id=$1 AND e.workflow_id=$2 AND o.organization_id=$3 AND o.effect_type='sms'
          AND o.status='reconciliation_required' AND o.cancelled_at IS NULL FOR UPDATE OF o`,
      [sideEffectId, workflowId, organizationId]);
      const sideEffect = selected.rows[0];
      if (!sideEffect) return { kind: 'invalid' };
      if (action === 'resend') {
        const updated = await client.query(`UPDATE workflow_side_effect_outbox SET status='retry',next_attempt_at=NOW(),
          lease_expires_at=NULL,last_error=NULL,operator_retry_count=operator_retry_count+1,last_operator_retry_at=NOW(),
          last_reconciled_at=NOW(),last_reconciliation_action='resend',last_reconciled_by=$2 WHERE id=$1 RETURNING *`,
        [sideEffectId, userId]);
        return { kind: 'ok', row: updated.rows[0] };
      }
      const updated = await client.query(`UPDATE workflow_side_effect_outbox SET status='sent',provider_id=$2,sent_at=NOW(),
        next_attempt_at=NULL,lease_expires_at=NULL,last_error=NULL,last_reconciled_at=NOW(),
        last_reconciliation_action='accepted',last_reconciled_by=$3 WHERE id=$1 RETURNING *`,
      [sideEffectId, providerId, userId]);
      const payload = sideEffect.payload && typeof sideEffect.payload === 'object' ? sideEffect.payload : {};
      await client.query(`INSERT INTO sms_logs (organization_id,contact_id,template_id,workflow_enrollment_id,
          workflow_side_effect_id,to_phone,from_phone,message,direction,status,external_id,segments,metadata,sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'outbound','sent',$9,$10,$11::jsonb,NOW())
        ON CONFLICT (workflow_side_effect_id) WHERE workflow_side_effect_id IS NOT NULL DO UPDATE SET
          status='sent',external_id=EXCLUDED.external_id,error_code=NULL,error_message=NULL,
          metadata=EXCLUDED.metadata,sent_at=EXCLUDED.sent_at`,
      [organizationId, payload.contactId ?? null, payload.templateId ?? null, sideEffect.enrollment_id,
        sideEffect.id, payload.to, payload.from ?? null, payload.message, providerId,
        payload.segments ?? 1, JSON.stringify({ reconciliation_action: 'accepted' })]);
      return { kind: 'ok', row: updated.rows[0] };
    });
  }

  private async ownedWorkflow(client: PoolClient, organizationId: number, workflowId: number): Promise<boolean> {
    const result = await client.query('SELECT 1 FROM workflows WHERE id=$1 AND organization_id=$2', [workflowId, organizationId]);
    return result.rows.length > 0;
  }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
