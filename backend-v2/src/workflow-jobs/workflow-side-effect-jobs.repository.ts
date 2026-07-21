import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { workflowJobBackoffMs } from './workflow-job.util';

export type WorkflowSideEffectClaim = {
  id: number;
  idempotency_key: string;
  organization_id: number;
  enrollment_id: number | null;
  step_id: number | null;
  effect_type: 'email' | 'sms' | 'webhook';
  payload: unknown;
  attempt_count: number;
};

export const redactWorkflowSideEffectError = (error: unknown): string =>
  String(error instanceof Error ? error.message : error || 'Workflow side-effect delivery failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+\d{7,15}\b/g, '[redacted-phone]')
    .replace(/\b(?:re|sk|whsec|AC|SK)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, '[redacted-authorization]')
    .replace(/\bsha256=[a-f0-9]{64}\b/gi, '[redacted-signature]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);

@Injectable()
export class WorkflowSideEffectJobsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async quarantineExpiredSms(outboxId: number | null = null): Promise<number> {
    const result = await this.pool.query(`UPDATE workflow_side_effect_outbox SET
      status='reconciliation_required',reconciliation_required_at=COALESCE(reconciliation_required_at,NOW()),
      reconciliation_reason='provider_result_unknown',next_attempt_at=NULL,lease_expires_at=NULL,
      last_error='SMS provider outcome requires operator reconciliation'
      WHERE effect_type='sms' AND ($1::bigint IS NULL OR id=$1) AND status='processing'
        AND cancelled_at IS NULL AND lease_expires_at <= NOW() RETURNING id`, [outboxId]);
    return result.rows.length;
  }

  claim(leaseSeconds: number, outboxId: number | null = null): Promise<WorkflowSideEffectClaim | null> {
    return this.transaction(async (client) => {
      await client.query(`UPDATE workflow_side_effect_outbox SET status='cancelled',next_attempt_at=NULL,lease_expires_at=NULL
        WHERE status='processing' AND ($1::bigint IS NULL OR id=$1) AND cancelled_at IS NOT NULL
          AND lease_expires_at <= NOW()`, [outboxId]);
      await client.query(`UPDATE workflow_side_effect_outbox SET status='reconciliation_required',
        reconciliation_required_at=COALESCE(reconciliation_required_at,NOW()),
        reconciliation_reason='provider_result_unknown',next_attempt_at=NULL,lease_expires_at=NULL,
        last_error='SMS provider outcome requires operator reconciliation'
        WHERE effect_type='sms' AND ($1::bigint IS NULL OR id=$1) AND status='processing'
          AND cancelled_at IS NULL AND lease_expires_at <= NOW()`, [outboxId]);
      const result = await client.query<WorkflowSideEffectClaim>(`WITH candidate AS (
          SELECT id FROM workflow_side_effect_outbox WHERE ($2::bigint IS NULL OR id=$2) AND cancelled_at IS NULL AND (
            (status IN ('queued','retry') AND COALESCE(next_attempt_at,created_at) <= NOW()) OR
            (status='processing' AND effect_type <> 'sms' AND lease_expires_at <= NOW()))
          ORDER BY COALESCE(next_attempt_at,created_at),created_at,id
          FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE workflow_side_effect_outbox outbox SET status='processing',attempt_count=attempt_count+1,
          lease_expires_at=NOW()+($1::int*INTERVAL '1 second'),last_error=NULL
        FROM candidate WHERE outbox.id=candidate.id RETURNING outbox.*`, [leaseSeconds, outboxId]);
      return result.rows[0] ?? null;
    });
  }

  markSent(claim: WorkflowSideEffectClaim, providerId: string | null): Promise<boolean> {
    return this.transaction(async (client) => {
      const updated = await client.query(`UPDATE workflow_side_effect_outbox SET status='sent',provider_id=$3,
        sent_at=NOW(),next_attempt_at=NULL,lease_expires_at=NULL,last_error=NULL
        WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING id`,
      [claim.id, claim.attempt_count, providerId]);
      if (updated.rows.length === 0) return false;
      const payload = this.record(claim.payload);
      if (claim.effect_type === 'email') {
        await client.query(`INSERT INTO email_logs
          (organization_id,contact_id,template_id,workflow_enrollment_id,workflow_side_effect_id,
            to_email,from_email,subject,body_html,status,external_id,metadata,sent_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sent',$10,$11::jsonb,NOW())
          ON CONFLICT (workflow_side_effect_id) WHERE workflow_side_effect_id IS NOT NULL DO UPDATE SET
            status='sent',external_id=EXCLUDED.external_id,error_message=NULL,sent_at=EXCLUDED.sent_at`,
        [claim.organization_id, payload.contactId || null, payload.templateId || null, claim.enrollment_id,
          claim.id, payload.to, payload.from || null, payload.subject, payload.bodyHtml || null, providerId,
          JSON.stringify({ idempotency_key: claim.idempotency_key })]);
      } else if (claim.effect_type === 'sms') {
        await client.query(`INSERT INTO sms_logs
          (organization_id,contact_id,template_id,workflow_enrollment_id,workflow_side_effect_id,
            to_phone,from_phone,message,direction,status,external_id,segments,sent_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'outbound','sent',$9,$10,NOW())
          ON CONFLICT (workflow_side_effect_id) WHERE workflow_side_effect_id IS NOT NULL DO UPDATE SET
            status='sent',external_id=EXCLUDED.external_id,error_code=NULL,error_message=NULL,sent_at=EXCLUDED.sent_at`,
        [claim.organization_id, payload.contactId || null, payload.templateId || null, claim.enrollment_id,
          claim.id, payload.to, payload.from || null, payload.message, providerId, payload.segments || 1]);
      }
      return true;
    });
  }

  async markFailure(claim: WorkflowSideEffectClaim, error: unknown, options: {
    maxAttempts: number; baseDelayMs: number; maximumDelayMs: number;
    retryable?: boolean; providerOutcomeUnknown?: boolean;
  }): Promise<'cancelled' | 'dead_letter' | 'reconciliation_required' | 'retry' | 'stale'> {
    if (claim.effect_type === 'sms' && options.providerOutcomeUnknown) {
      const result = await this.pool.query<{ status: 'cancelled' | 'reconciliation_required' }>(
        `UPDATE workflow_side_effect_outbox SET
          status=CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'reconciliation_required' END,
          reconciliation_required_at=CASE WHEN cancelled_at IS NOT NULL THEN reconciliation_required_at
            ELSE COALESCE(reconciliation_required_at,NOW()) END,
          reconciliation_reason=CASE WHEN cancelled_at IS NOT NULL THEN reconciliation_reason
            ELSE 'provider_result_unknown' END,
          next_attempt_at=NULL,lease_expires_at=NULL,last_error=$3
        WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING status`,
        [claim.id, claim.attempt_count, redactWorkflowSideEffectError(error)]);
      return result.rows[0]?.status ?? 'stale';
    }
    const status = options.retryable === false || claim.attempt_count >= options.maxAttempts
      ? 'dead_letter' : 'retry';
    const delay = workflowJobBackoffMs(claim.attempt_count, options.baseDelayMs, options.maximumDelayMs);
    const result = await this.pool.query<{ status: 'cancelled' | 'dead_letter' | 'retry' }>(
      `UPDATE workflow_side_effect_outbox SET
        status=CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' ELSE $3::varchar END,
        next_attempt_at=CASE WHEN cancelled_at IS NOT NULL OR $3::varchar='dead_letter' THEN NULL
          ELSE NOW()+($4::bigint*INTERVAL '1 millisecond') END,
        lease_expires_at=NULL,last_error=$5
      WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING status`,
      [claim.id, claim.attempt_count, status, delay, redactWorkflowSideEffectError(error)]);
    return result.rows[0]?.status ?? 'stale';
  }

  private record(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
