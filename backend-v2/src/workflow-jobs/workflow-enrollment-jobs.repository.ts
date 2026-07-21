import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { smsMessageInfo } from '../sms-templates/sms-message-info';
import { PG_POOL } from '../database/database.module';
import {
  asRecord,
  JsonRecord,
  normalizeWorkflowPhone,
  replaceWorkflowVariables,
  validWorkflowPhone,
  workflowConditionResult,
  workflowTemplateData,
  workflowWaitUntil,
  workflowWebhookHeaders,
  workflowWebhookUrl,
  wrapWorkflowEmail,
} from './workflow-enrollment.util';
import { redactWorkflowJobError } from './workflow-job.util';

export type WorkflowEnrollmentClaim = {
  id: number;
  execution_attempt_count: number;
  execution_claim_token: string;
  execution_lease_expires_at: Date;
  lease_seconds: number;
};

export type WorkflowEnrollmentResult = {
  completed?: boolean;
  error?: string;
  failed?: boolean;
  skipped?: boolean;
  stale?: boolean;
  waiting?: boolean;
};

type Enrollment = {
  id: number;
  workflow_id: number;
  contact_id: number;
  current_step: number;
  context: unknown;
  enrolled_at: Date;
  organization_id: number;
  workflow_created_by: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  contact_custom_fields: unknown;
  contact_tags: string[] | null;
};

type Step = {
  id: number;
  step_order: number;
  step_type: string;
  step_config: unknown;
  condition_config: unknown;
  true_branch_step: number | null;
  false_branch_step: number | null;
};

type StepResult = {
  success: boolean;
  error?: string;
  waitingUntil?: Date;
  branchResult?: boolean;
  outboxId?: number;
  queued?: boolean;
};

type StepOutcome = WorkflowEnrollmentResult & { continue?: boolean };

@Injectable()
export class WorkflowEnrollmentJobsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async claimEnrollment(leaseSeconds: number, enrollmentId: number | null = null): Promise<WorkflowEnrollmentClaim | null> {
    const token = randomUUID();
    const result = await this.pool.query<Omit<WorkflowEnrollmentClaim, 'lease_seconds'>>(`WITH candidate AS (
        SELECT id FROM workflow_enrollments
        WHERE status='active' AND next_action_at <= NOW() AND ($1::int IS NULL OR id=$1)
          AND (execution_claim_token IS NULL OR execution_lease_expires_at <= NOW())
        ORDER BY next_action_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE workflow_enrollments enrollment SET
        execution_attempt_count=execution_attempt_count+1,execution_claim_token=$2::uuid,
        execution_lease_expires_at=NOW()+($3::int*INTERVAL '1 second')
      FROM candidate WHERE enrollment.id=candidate.id
      RETURNING enrollment.id,enrollment.execution_attempt_count,enrollment.execution_claim_token,
        enrollment.execution_lease_expires_at`, [enrollmentId, token, leaseSeconds]);
    return result.rows[0] ? { ...result.rows[0], lease_seconds: leaseSeconds } : null;
  }

  async processEnrollment(claim: WorkflowEnrollmentClaim): Promise<WorkflowEnrollmentResult> {
    while (true) {
      let outcome: StepOutcome;
      try {
        outcome = await this.processStep(claim);
      } catch (error) {
        const persisted = await this.failClaim(claim, redactWorkflowJobError(error));
        return persisted
          ? { failed: true, error: redactWorkflowJobError(error) }
          : { skipped: true, stale: true, error: 'Enrollment claim is no longer authoritative' };
      }
      if (!outcome.continue) return outcome;
    }
  }

  private processStep(claim: WorkflowEnrollmentClaim): Promise<StepOutcome> {
    return this.transaction(async (client) => {
      const found = await client.query<Enrollment>(`SELECT we.id,we.workflow_id,we.contact_id,we.current_step,
          we.context,we.enrolled_at,w.organization_id,w.created_by AS workflow_created_by,
          c.first_name,c.last_name,c.email,c.phone,c.company,c.job_title,
          c.custom_fields AS contact_custom_fields,c.tags AS contact_tags
        FROM workflow_enrollments we JOIN contacts c ON c.id=we.contact_id
        JOIN workflows w ON w.id=we.workflow_id
        WHERE we.id=$1 AND we.status='active' AND we.execution_attempt_count=$2
          AND we.execution_claim_token=$3::uuid FOR UPDATE OF we`,
      [claim.id, claim.execution_attempt_count, claim.execution_claim_token]);
      const enrollment = found.rows[0];
      if (!enrollment) return { skipped: true, stale: true, error: 'Enrollment claim is no longer authoritative' };

      const stepResult = await client.query<Step>(`SELECT id,step_order,step_type,step_config,condition_config,
        true_branch_step,false_branch_step FROM workflow_steps
        WHERE workflow_id=$1 AND step_order=$2`, [enrollment.workflow_id, enrollment.current_step]);
      const step = stepResult.rows[0];
      if (!step) {
        const persisted = await this.complete(client, claim);
        return persisted ? { completed: true } : { skipped: true, stale: true };
      }

      const started = Date.now();
      await this.log(client, enrollment.id, step, 'started', {}, {}, null, null);
      let result: StepResult;
      try {
        result = await this.executeStep(client, enrollment, step);
      } catch (error) {
        result = { success: false, error: redactWorkflowJobError(error) };
      }
      const safeOutput = {
        success: result.success,
        ...(result.queued ? { queued: true, outboxId: result.outboxId } : {}),
        ...(result.waitingUntil ? { waitingUntil: result.waitingUntil.toISOString() } : {}),
        ...(result.branchResult !== undefined ? { branchResult: result.branchResult } : {}),
      };
      await this.log(client, enrollment.id, step, result.success ? 'completed' : 'failed', {
        step_type: step.step_type,
        config_keys: Object.keys(asRecord(step.step_config)).sort(),
      }, safeOutput, result.error ?? null, Date.now() - started);
      if (!result.success) {
        const persisted = await this.fail(client, claim, result.error || 'Workflow step failed');
        return persisted ? { failed: true, error: result.error } : { skipped: true, stale: true };
      }

      let nextStep = enrollment.current_step + 1;
      if (step.step_type === 'condition') {
        nextStep = (result.branchResult ? step.true_branch_step : step.false_branch_step) ?? nextStep;
      }
      const next = await client.query('SELECT 1 FROM workflow_steps WHERE workflow_id=$1 AND step_order=$2',
        [enrollment.workflow_id, nextStep]);
      if (next.rows.length === 0) {
        const persisted = await this.complete(client, claim);
        return persisted ? { completed: true } : { skipped: true, stale: true };
      }

      const waiting = Boolean(result.waitingUntil);
      const progressed = await client.query(`UPDATE workflow_enrollments SET current_step=$1,next_action_at=$2,
          execution_claim_token=CASE WHEN $3::boolean THEN NULL ELSE execution_claim_token END,
          execution_lease_expires_at=CASE WHEN $3::boolean THEN NULL
            ELSE NOW()+($4::int*INTERVAL '1 second') END
        WHERE id=$5 AND status='active' AND execution_attempt_count=$6 AND execution_claim_token=$7::uuid
        RETURNING id`, [nextStep, result.waitingUntil ?? new Date(), waiting, claim.lease_seconds,
        claim.id, claim.execution_attempt_count, claim.execution_claim_token]);
      if (progressed.rows.length === 0) throw new Error('Enrollment claim expired before progress could be recorded');
      return waiting ? { waiting: true } : { continue: true };
    });
  }

  private async executeStep(client: PoolClient, enrollment: Enrollment, step: Step): Promise<StepResult> {
    const contact: JsonRecord = {
      id: enrollment.contact_id, first_name: enrollment.first_name, last_name: enrollment.last_name,
      email: enrollment.email, phone: enrollment.phone, company: enrollment.company,
      job_title: enrollment.job_title, custom_fields: enrollment.contact_custom_fields,
      tags: enrollment.contact_tags,
    };
    const config = asRecord(step.step_config);
    switch (step.step_type) {
      case 'send_email': return this.email(client, enrollment, step, contact, config);
      case 'send_sms': return this.sms(client, enrollment, step, contact, config);
      case 'webhook': return this.webhook(client, enrollment, step, contact, config);
      case 'add_tag': return this.addTag(client, enrollment, contact, config);
      case 'remove_tag': return this.removeTag(client, enrollment, contact, config);
      case 'wait': {
        try { return { success: true, waitingUntil: workflowWaitUntil(config) ?? undefined }; }
        catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
      }
      case 'create_task': return this.createTask(client, enrollment, contact, config);
      case 'update_contact': return this.updateContact(client, enrollment, contact, config);
      case 'condition': {
        try { return { success: true, branchResult: workflowConditionResult(contact, step.condition_config) }; }
        catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
      }
      case 'move_deal': return this.moveDeal(client, enrollment, config);
      default: return { success: false, error: `Unknown step type: ${step.step_type}` };
    }
  }

  private async email(client: PoolClient, enrollment: Enrollment, step: Step, contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    if (!enrollment.email) return { success: false, error: 'Contact has no email address' };
    if (!config.template_id) return { success: false, error: 'No template_id specified' };
    const template = await client.query<{ id: number; subject: string; body_html: string; body_text: string | null }>(
      `SELECT id,subject,body_html,body_text FROM email_templates WHERE id=$1 AND organization_id=$2`,
      [config.template_id, enrollment.organization_id]);
    if (!template.rows[0]) return { success: false, error: 'Email template not found' };
    const data = workflowTemplateData(contact, enrollment.context);
    const subject = replaceWorkflowVariables(template.rows[0].subject, data);
    const html = wrapWorkflowEmail(replaceWorkflowVariables(template.rows[0].body_html, data), subject);
    const text = template.rows[0].body_text === null ? null : replaceWorkflowVariables(template.rows[0].body_text, data);
    const outbox = await this.enqueue(client, enrollment, step, 'email', {
      bodyHtml: html, bodyText: text, contactId: enrollment.contact_id, subject,
      templateId: template.rows[0].id, to: enrollment.email,
    });
    return { success: true, queued: true, outboxId: outbox.id };
  }

  private async sms(client: PoolClient, enrollment: Enrollment, step: Step, contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    if (!enrollment.phone) return { success: false, error: 'Contact has no phone number' };
    if (!config.template_id && !config.message) return { success: false, error: 'No template_id or message specified' };
    let rawMessage = config.message;
    let templateId: number | null = null;
    if (config.template_id) {
      const template = await client.query<{ id: number; message: string }>(
        'SELECT id,message FROM sms_templates WHERE id=$1 AND organization_id=$2',
        [config.template_id, enrollment.organization_id]);
      if (!template.rows[0]) return { success: false, error: 'SMS template not found' };
      rawMessage = template.rows[0].message;
      templateId = Number(template.rows[0].id);
    }
    const message = replaceWorkflowVariables(rawMessage, contact);
    const recipient = normalizeWorkflowPhone(enrollment.phone);
    if (!validWorkflowPhone(recipient)) return { success: false, error: 'Contact phone number is invalid' };
    const sender = await client.query<{ phone_number: string }>(`SELECT phone_number FROM sms_receiving_numbers
      WHERE organization_id=$1 AND provider='twilio' AND is_active=true
      ORDER BY is_primary DESC,id LIMIT 1`, [enrollment.organization_id]);
    if (!sender.rows[0]) return { success: false, error: 'No active organization SMS number is configured' };
    const outbox = await this.enqueue(client, enrollment, step, 'sms', {
      contactId: enrollment.contact_id, from: sender.rows[0].phone_number, message,
      segments: smsMessageInfo(message).segments, templateId, to: recipient,
    });
    return { success: true, queued: true, outboxId: outbox.id };
  }

  private async webhook(client: PoolClient, enrollment: Enrollment, step: Step, contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    if (!config.url) return { success: false, error: 'No webhook URL specified' };
    try {
      const method = String(config.method || 'POST').toUpperCase();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return { success: false, error: 'Unsupported workflow webhook method' };
      }
      const body = {
        ...asRecord(config.custom_payload), event: 'workflow_step', workflow_id: enrollment.workflow_id,
        contact: { id: contact.id, email: contact.email, first_name: contact.first_name,
          last_name: contact.last_name, company: contact.company },
        enrollment_id: enrollment.id, timestamp: new Date().toISOString(),
      };
      if (Buffer.byteLength(JSON.stringify(body)) > 256 * 1024) {
        return { success: false, error: 'Workflow webhook request exceeded the byte limit' };
      }
      const outbox = await this.enqueue(client, enrollment, step, 'webhook', {
        body, headers: workflowWebhookHeaders(config.headers), method, url: workflowWebhookUrl(config.url),
      });
      return { success: true, queued: true, outboxId: outbox.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async addTag(client: PoolClient, enrollment: Enrollment, contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    if (!config.tag_name) return { success: false, error: 'No tag_name specified' };
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    if (!tags.includes(config.tag_name)) {
      await client.query(`UPDATE contacts SET tags=array_append(tags,$1),updated_at=NOW()
        WHERE id=$2 AND organization_id=$3`, [config.tag_name, enrollment.contact_id, enrollment.organization_id]);
    }
    return { success: true };
  }

  private async removeTag(client: PoolClient, enrollment: Enrollment, _contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    if (!config.tag_name) return { success: false, error: 'No tag_name specified' };
    await client.query(`UPDATE contacts SET tags=array_remove(tags,$1),updated_at=NOW()
      WHERE id=$2 AND organization_id=$3`, [config.tag_name, enrollment.contact_id, enrollment.organization_id]);
    return { success: true };
  }

  private async createTask(client: PoolClient, enrollment: Enrollment, contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    const dueDays = config.due_days ? Number(config.due_days) : 0;
    const dueDate = dueDays ? new Date(Date.now() + dueDays * 86_400_000) : null;
    const assignedTo = config.assigned_to ? Number(config.assigned_to) : null;
    const inserted = await client.query(`INSERT INTO tasks
        (organization_id,contact_id,title,description,due_date,priority,status,assigned_to,created_by)
      SELECT $1,$2,$3,$4,$5,$6,'pending',$7,$8
      WHERE $7::int IS NULL OR EXISTS (SELECT 1 FROM organization_members
        WHERE organization_id=$1 AND user_id=$7) RETURNING id`,
    [enrollment.organization_id, enrollment.contact_id,
      replaceWorkflowVariables(config.title || 'Follow up', contact),
      replaceWorkflowVariables(config.description || '', contact), dueDate,
      config.priority || 'medium', assignedTo, enrollment.workflow_created_by]);
    return inserted.rows.length > 0 ? { success: true }
      : { success: false, error: 'Assigned user is not a member of the workflow organization' };
  }

  private async updateContact(client: PoolClient, enrollment: Enrollment, _contact: JsonRecord, config: JsonRecord): Promise<StepResult> {
    const updates: string[] = [];
    const values: unknown[] = [enrollment.contact_id];
    if (config.status) { values.push(config.status); updates.push(`status=$${values.length}`); }
    if (config.custom_fields) {
      values.push(JSON.stringify(asRecord(config.custom_fields)));
      updates.push(`custom_fields=custom_fields || $${values.length}::jsonb`);
    }
    if (updates.length === 0) return { success: true };
    values.push(enrollment.organization_id);
    await client.query(`UPDATE contacts SET ${updates.join(',')},updated_at=NOW()
      WHERE id=$1 AND organization_id=$${values.length}`, values);
    return { success: true };
  }

  private async moveDeal(client: PoolClient, enrollment: Enrollment, config: JsonRecord): Promise<StepResult> {
    if (!config.stage_id) return { success: false, error: 'stage_id required' };
    let dealId = config.deal_id ? Number(config.deal_id) : null;
    if (!dealId) {
      const deal = await client.query<{ id: number }>(`SELECT id FROM deals WHERE contact_id=$1
        AND organization_id=$2 AND won_at IS NULL AND lost_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [enrollment.contact_id, enrollment.organization_id]);
      if (!deal.rows[0]) return { success: true };
      dealId = Number(deal.rows[0].id);
    }
    const updated = await client.query(`UPDATE deals d SET stage_id=$1,updated_at=NOW()
      WHERE d.id=$2 AND d.organization_id=$3 AND EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.pipeline_id=d.pipeline_id AND ps.stage_key=$1)
      RETURNING d.id`, [config.stage_id, dealId, enrollment.organization_id]);
    return updated.rows.length > 0 ? { success: true }
      : { success: false, error: 'Deal or stage not found in workflow organization' };
  }

  private async enqueue(client: PoolClient, enrollment: Enrollment, step: Step, effectType: string, payload: JsonRecord): Promise<{ id: number }> {
    const runAt = new Date(enrollment.enrolled_at);
    if (!enrollment.id || !enrollment.organization_id || !step.id || Number.isNaN(runAt.getTime())) {
      throw new Error('Workflow side-effect identity is unavailable');
    }
    const key = `workflow-${enrollment.id}-${step.id}-${runAt.getTime()}`;
    const result = await client.query<{ id: number }>(`INSERT INTO workflow_side_effect_outbox
        (idempotency_key,organization_id,enrollment_id,step_id,enrollment_run_at,effect_type,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (enrollment_id,step_id,enrollment_run_at) DO UPDATE SET
        idempotency_key=workflow_side_effect_outbox.idempotency_key RETURNING id`,
    [key, enrollment.organization_id, enrollment.id, step.id, runAt.toISOString(), effectType, JSON.stringify(payload)]);
    return result.rows[0];
  }

  private async complete(client: PoolClient, claim: WorkflowEnrollmentClaim): Promise<boolean> {
    const result = await client.query<{ workflow_id: number }>(`UPDATE workflow_enrollments SET status='completed',
      completed_at=NOW(),next_action_at=NULL,execution_claim_token=NULL,execution_lease_expires_at=NULL
      WHERE id=$1 AND status='active' AND execution_attempt_count=$2 AND execution_claim_token=$3::uuid
      RETURNING workflow_id`, [claim.id, claim.execution_attempt_count, claim.execution_claim_token]);
    if (result.rows[0]) await this.incrementStat(client, result.rows[0].workflow_id, 'completed');
    return Boolean(result.rows[0]);
  }

  private async fail(client: PoolClient, claim: WorkflowEnrollmentClaim, error: string): Promise<boolean> {
    const result = await client.query<{ workflow_id: number }>(`UPDATE workflow_enrollments SET status='failed',
      error_message=$4,completed_at=NOW(),next_action_at=NULL,execution_claim_token=NULL,execution_lease_expires_at=NULL
      WHERE id=$1 AND status='active' AND execution_attempt_count=$2 AND execution_claim_token=$3::uuid
      RETURNING workflow_id`, [claim.id, claim.execution_attempt_count, claim.execution_claim_token,
      redactWorkflowJobError(error)]);
    if (result.rows[0]) await this.incrementStat(client, result.rows[0].workflow_id, 'failed');
    return Boolean(result.rows[0]);
  }

  private failClaim(claim: WorkflowEnrollmentClaim, error: string): Promise<boolean> {
    return this.transaction((client) => this.fail(client, claim, error));
  }

  private async incrementStat(client: PoolClient, workflowId: number, key: 'completed' | 'failed'): Promise<void> {
    await client.query(`UPDATE workflows SET stats=jsonb_set(COALESCE(stats,'{}'::jsonb),ARRAY[$2]::text[],
      to_jsonb(COALESCE((stats->>$2)::int,0)+1),true) WHERE id=$1`, [workflowId, key]);
  }

  private async log(client: PoolClient, enrollmentId: number, step: Step, status: string,
    input: unknown, output: unknown, error: string | null, duration: number | null): Promise<void> {
    await client.query(`INSERT INTO workflow_execution_logs
      (enrollment_id,step_id,step_order,action_type,status,input_data,output_data,error_message,duration_ms)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
    [enrollmentId, step.id, step.step_order, step.step_type, status,
      JSON.stringify(input), JSON.stringify(output), error ? redactWorkflowJobError(error) : null, duration]);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
