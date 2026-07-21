import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { redactWorkflowJobError, workflowJobBackoffMs, workflowTriggerMatches } from './workflow-job.util';

export type WorkflowTriggerClaim = {
  id: number;
  workflow_id: number | null;
  organization_id: number;
  contact_id: number | null;
  trigger_type: string;
  payload: unknown;
  source: string;
  attempt_count: number;
};

export type WorkflowTriggerResult = {
  persisted: boolean;
  enrolled: number;
  matchedWorkflows: number;
  alreadyActive: number;
  paused: number;
  conditionMisses: number;
  skippedReason?: string;
};

@Injectable()
export class WorkflowTriggerJobsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  claimScheduled(workflowId: number | null = null): Promise<{ workflowId: number; triggerId: number } | null> {
    return this.transaction(async (client) => {
      const due = await client.query<{
        id: number; organization_id: number; scheduled_contact_id: number; next_trigger_at: Date;
      }>(`SELECT id,organization_id,scheduled_contact_id,next_trigger_at FROM workflows
        WHERE trigger_type='scheduled' AND is_active=true AND scheduled_contact_id IS NOT NULL
          AND next_trigger_at <= NOW() AND ($1::int IS NULL OR id=$1)
        ORDER BY next_trigger_at,id FOR UPDATE SKIP LOCKED LIMIT 1`, [workflowId]);
      const workflow = due.rows[0];
      if (!workflow) return null;
      const scheduledAt = new Date(workflow.next_trigger_at).toISOString();
      await client.query(`UPDATE workflows SET last_triggered_at=next_trigger_at,next_trigger_at=NULL,
        updated_at=NOW() WHERE id=$1`, [workflow.id]);
      const eventKey = `domain:scheduled:${workflow.id}:${scheduledAt}`;
      const trigger = await client.query<{ id: number }>(`WITH inserted AS (
          INSERT INTO workflow_triggers (workflow_id,organization_id,contact_id,trigger_type,entity_type,
            entity_id,payload,status,event_key,source,occurred_at,next_attempt_at)
          VALUES ($1,$2,$3,'scheduled','workflow',$1,$4::jsonb,'queued',$5,'domain',$6,NOW())
          ON CONFLICT DO NOTHING RETURNING id,true AS inserted
        ) SELECT id,inserted FROM inserted UNION ALL
          SELECT id,false AS inserted FROM workflow_triggers WHERE event_key=$5
        ORDER BY inserted DESC LIMIT 1`, [workflow.id, workflow.organization_id,
        workflow.scheduled_contact_id, JSON.stringify({ scheduled_at: scheduledAt, workflow_id: workflow.id }),
        eventKey, scheduledAt]);
      if (!trigger.rows[0]) throw new Error('Scheduled workflow trigger could not be inserted or resolved');
      return { workflowId: Number(workflow.id), triggerId: Number(trigger.rows[0].id) };
    });
  }

  claimTrigger(leaseSeconds: number, triggerId: number | null = null): Promise<WorkflowTriggerClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<WorkflowTriggerClaim>(`WITH candidate AS (
          SELECT id FROM workflow_triggers WHERE ($2::int IS NULL OR id=$2) AND (
            (status IN ('queued','retry') AND COALESCE(next_attempt_at,created_at) <= NOW()) OR
            (status='processing' AND lease_expires_at <= NOW()))
          ORDER BY COALESCE(next_attempt_at,created_at),created_at,id
          FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE workflow_triggers t SET status='processing',attempt_count=attempt_count+1,
          lease_expires_at=NOW()+($1::int*INTERVAL '1 second'),last_error=NULL,updated_at=NOW()
        FROM candidate WHERE t.id=candidate.id RETURNING t.*`, [leaseSeconds, triggerId]);
      return result.rows[0] ?? null;
    });
  }

  processTrigger(claim: WorkflowTriggerClaim): Promise<WorkflowTriggerResult> {
    return this.transaction(async (client) => {
      const current = await client.query<WorkflowTriggerClaim>(`SELECT * FROM workflow_triggers
        WHERE id=$1 AND status='processing' AND attempt_count=$2 FOR UPDATE`, [claim.id, claim.attempt_count]);
      const event = current.rows[0];
      if (!event) return this.empty(false, 'stale_claim');
      const contactId = event.contact_id;
      if (!contactId) {
        const result = this.empty(false, 'contact_not_provided');
        result.persisted = await this.complete(client, claim, result);
        return result;
      }
      const contact = await client.query('SELECT 1 FROM contacts WHERE id=$1 AND organization_id=$2',
        [contactId, event.organization_id]);
      if (contact.rows.length === 0) {
        const result = this.empty(false, 'contact_not_found');
        result.persisted = await this.complete(client, claim, result);
        return result;
      }
      const workflows = await client.query<{ id: number; trigger_config: unknown }>(`SELECT id,trigger_config FROM workflows
        WHERE organization_id=$1 AND trigger_type=$2 AND is_active=true AND ($3::int IS NULL OR id=$3)
        ORDER BY id FOR UPDATE`, [event.organization_id, event.trigger_type, event.workflow_id]);
      const result: WorkflowTriggerResult = {
        persisted: false, enrolled: 0, matchedWorkflows: workflows.rows.length,
        alreadyActive: 0, paused: 0, conditionMisses: 0,
      };
      const payload = this.record(event.payload);
      const triggerData = { ...payload, event_id: event.id, event_source: event.source, trigger_type: event.trigger_type };
      for (const workflow of workflows.rows) {
        if (!workflowTriggerMatches(workflow.trigger_config, payload)) { result.conditionMisses += 1; continue; }
        const activation = await this.activateEnrollment(client, workflow.id, contactId, triggerData);
        if (activation === 'active') result.enrolled += 1;
        else if (activation === 'paused') result.paused += 1;
        else result.alreadyActive += 1;
      }
      result.persisted = await this.complete(client, claim, result);
      return result;
    });
  }

  async failTrigger(claim: WorkflowTriggerClaim, error: unknown, options: {
    maxAttempts: number; baseDelayMs: number; maximumDelayMs: number;
  }): Promise<'dead_letter' | 'retry' | 'stale'> {
    const status = claim.attempt_count >= options.maxAttempts ? 'dead_letter' : 'retry';
    const delay = workflowJobBackoffMs(claim.attempt_count, options.baseDelayMs, options.maximumDelayMs);
    const result = await this.pool.query<{ status: 'dead_letter' | 'retry' }>(`UPDATE workflow_triggers SET status=$3::varchar,
      next_attempt_at=CASE WHEN $3::varchar='dead_letter' THEN NULL ELSE NOW()+($4::bigint*INTERVAL '1 millisecond') END,
      lease_expires_at=NULL,last_error=$5,updated_at=NOW()
      WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING status`,
    [claim.id, claim.attempt_count, status, delay, redactWorkflowJobError(error)]);
    return result.rows[0]?.status ?? 'stale';
  }

  private async activateEnrollment(client: PoolClient, workflowId: number, contactId: number, triggerData: Record<string, unknown>): Promise<'active'|'paused'|'already_active'> {
    const existing = await client.query<{ id: number; status: string }>(`SELECT id,status FROM workflow_enrollments
      WHERE workflow_id=$1 AND contact_id=$2 FOR UPDATE`, [workflowId, contactId]);
    const enrollment = existing.rows[0];
    if (enrollment && enrollment.status === 'paused') return 'paused';
    if (enrollment && enrollment.status === 'active') return 'already_active';
    if (enrollment) {
      await client.query(`UPDATE workflow_enrollments SET status='active',current_step=1,trigger_data=$2::jsonb,
        context='{}'::jsonb,error_message=NULL,enrolled_at=NOW(),next_action_at=NOW(),completed_at=NULL,
        execution_attempt_count=0,execution_claim_token=NULL,execution_lease_expires_at=NULL,pause_reason=NULL,paused_at=NULL
        WHERE id=$1`, [enrollment.id, JSON.stringify(triggerData)]);
    } else {
      await client.query(`INSERT INTO workflow_enrollments (workflow_id,contact_id,current_step,status,trigger_data,
        context,enrolled_at,next_action_at) VALUES ($1,$2,1,'active',$3::jsonb,'{}'::jsonb,NOW(),NOW())`,
      [workflowId, contactId, JSON.stringify(triggerData)]);
    }
    await client.query(`UPDATE workflows SET stats=jsonb_set(COALESCE(stats,'{}'::jsonb),'{enrolled}',
      to_jsonb(COALESCE((stats->>'enrolled')::int,0)+1),true) WHERE id=$1`, [workflowId]);
    return 'active';
  }

  private async complete(client: PoolClient, claim: WorkflowTriggerClaim, result: WorkflowTriggerResult): Promise<boolean> {
    const { persisted: _persisted, ...storedResult } = result;
    const updated = await client.query(`UPDATE workflow_triggers SET status='completed',result=$3::jsonb,
      processed_at=NOW(),next_attempt_at=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=NOW()
      WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING id`,
    [claim.id, claim.attempt_count, JSON.stringify(storedResult)]);
    return updated.rows.length > 0;
  }
  private empty(persisted: boolean, skippedReason: string): WorkflowTriggerResult {
    return { persisted, enrolled: 0, matchedWorkflows: 0, alreadyActive: 0, paused: 0, conditionMisses: 0, skippedReason };
  }
  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
