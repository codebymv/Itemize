import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { ReconcileWorkflowSmsSideEffectInput, WorkflowSideEffectFilterInput } from './workflow-execution.inputs';
import { WorkflowExecutionRepository, SideEffectRow, SummaryRow } from './workflow-execution.repository';
import {
  WorkflowExecutionSummary, WorkflowSideEffect, WorkflowSideEffectPage,
} from './workflow-execution.types';

const STATUSES = new Set(['queued','processing','retry','sent','dead_letter','cancelled','reconciliation_required']);
const TYPES = new Set(['email','sms','webhook']);

@Injectable()
export class WorkflowExecutionService {
  constructor(private readonly repository: WorkflowExecutionRepository) {}

  async summary(organizationId: number, workflowId: number): Promise<WorkflowExecutionSummary> {
    this.id(workflowId, 'workflowId');
    const result = await this.repository.summary(organizationId, workflowId);
    if (result.kind === 'not_found') this.notFound();
    const s = result.sideEffects; const e = result.enrollments;
    return {
      workflowId,
      sideEffects: {
        total: this.integer(s.total),
        byStatus: {
          queued: this.integer(s.queued_count), processing: this.integer(s.processing_count),
          retry: this.integer(s.retry_count), sent: this.integer(s.sent_count),
          deadLetter: this.integer(s.dead_letter_count), cancelled: this.integer(s.cancelled_count),
          reconciliationRequired: this.integer(s.reconciliation_required_count),
        },
        byType: { email: this.integer(s.email_count), sms: this.integer(s.sms_count), webhook: this.integer(s.webhook_count) },
        dueCount: this.integer(s.due_count), expiredProcessingCount: this.integer(s.expired_processing_count),
        maxAttemptCount: this.integer(s.max_attempt_count), totalAttemptCount: this.integer(s.total_attempt_count),
        operatorRetryCount: this.integer(s.operator_retry_count),
        oldestPendingAt: this.date(s.oldest_pending_at), oldestPendingAgeSeconds: this.nullableInteger(s.oldest_pending_age_seconds),
        lastOperatorRetryAt: this.date(s.last_operator_retry_at), latestDeadLetterAt: this.date(s.latest_dead_letter_at),
      },
      enrollments: {
        total: this.integer(e.total), active: this.integer(e.active_count), paused: this.integer(e.paused_count),
        completed: this.integer(e.completed_count), failed: this.integer(e.failed_count), cancelled: this.integer(e.cancelled_count),
        oldestDueAt: this.date(e.oldest_due_at), oldestDueAgeSeconds: this.nullableInteger(e.oldest_due_age_seconds),
      },
    };
  }

  async list(organizationId: number, workflowId: number, filter: WorkflowSideEffectFilterInput = {}, page: PageInput = new PageInput()): Promise<WorkflowSideEffectPage> {
    this.id(workflowId, 'workflowId');
    if (filter.status !== undefined && !STATUSES.has(filter.status)) this.invalid('status', 'INVALID_WORKFLOW_SIDE_EFFECT_STATUS');
    if (filter.effectType !== undefined && !TYPES.has(filter.effectType)) this.invalid('effectType', 'INVALID_WORKFLOW_SIDE_EFFECT_TYPE');
    if (!Number.isInteger(page.page) || page.page < 1 || page.page > 1_000_000 || !Number.isInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > 100) {
      this.invalid('page', 'INVALID_PAGE');
    }
    const result = await this.repository.findPage({ organizationId, workflowId,
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.effectType === undefined ? {} : { effectType: filter.effectType }),
      limit: page.pageSize, offset: (page.page - 1) * page.pageSize });
    if (result.kind === 'not_found') this.notFound();
    const total = this.integer(result.total);
    return { nodes: result.rows.map((row) => this.map(row)), pageInfo: pageInfo(page.page, page.pageSize, total) };
  }

  async retry(organizationId: number, workflowId: number, sideEffectId: number): Promise<WorkflowSideEffect> {
    this.ids(workflowId, sideEffectId);
    const result = await this.repository.retry(organizationId, workflowId, sideEffectId);
    if (result.kind === 'not_found') this.notFound();
    if (result.kind === 'invalid') this.invalid('sideEffectId', 'WORKFLOW_SIDE_EFFECT_NOT_RETRYABLE');
    return this.map(result.row);
  }

  async reconcile(organizationId: number, userId: number, workflowId: number, sideEffectId: number, input: ReconcileWorkflowSmsSideEffectInput): Promise<WorkflowSideEffect> {
    this.ids(workflowId, sideEffectId);
    if (input.action !== 'accepted' && input.action !== 'resend') this.invalid('action', 'INVALID_WORKFLOW_RECONCILIATION_ACTION');
    const providerId = input.providerId?.trim();
    if (input.action === 'accepted' && !/^SM[0-9a-fA-F]{32}$/.test(providerId ?? '')) this.invalid('providerId', 'INVALID_TWILIO_MESSAGE_SID');
    const result = await this.repository.reconcile(organizationId, userId, workflowId, sideEffectId, input.action, providerId);
    if (result.kind === 'not_found') this.notFound();
    if (result.kind === 'invalid') this.invalid('sideEffectId', 'WORKFLOW_SIDE_EFFECT_NOT_RECONCILABLE');
    return this.map(result.row);
  }

  private map(row: SideEffectRow): WorkflowSideEffect {
    const first = this.string(row.first_name); const last = this.string(row.last_name);
    const createdAt = this.requiredDate(row.created_at);
    const nextAttemptAt = this.date(row.next_attempt_at);
    const leaseExpiresAt = this.date(row.lease_expires_at);
    const now = Date.now();
    return {
      id: this.integer(row.id), enrollmentId: this.nullableInteger(row.enrollment_id), stepId: this.nullableInteger(row.step_id),
      stepOrder: this.nullableInteger(row.step_order), stepType: this.string(row.step_type), effectType: String(row.effect_type),
      status: String(row.status), attemptCount: this.integer(row.attempt_count), operatorRetryCount: this.integer(row.operator_retry_count),
      providerId: this.string(row.provider_id), lastError: row.last_error ? this.redact(row.last_error) : null,
      nextAttemptAt, leaseExpiresAt, cancelledAt: this.date(row.cancelled_at),
      cancellationReason: this.string(row.cancellation_reason), lastOperatorRetryAt: this.date(row.last_operator_retry_at),
      reconciliationRequiredAt: this.date(row.reconciliation_required_at), reconciliationReason: this.string(row.reconciliation_reason),
      lastReconciledAt: this.date(row.last_reconciled_at), lastReconciliationAction: this.string(row.last_reconciliation_action),
      lastReconciledBy: this.nullableInteger(row.last_reconciled_by), createdAt, sentAt: this.date(row.sent_at),
      isDue: row.is_due === undefined
        ? ['queued','retry'].includes(String(row.status)) && (nextAttemptAt ?? createdAt).getTime() <= now
        : Boolean(row.is_due),
      leaseExpired: row.lease_expired === undefined
        ? row.status === 'processing' && leaseExpiresAt !== null && leaseExpiresAt.getTime() <= now
        : Boolean(row.lease_expired),
      ageSeconds: row.age_seconds === undefined ? Math.max(0,Math.floor((now-createdAt.getTime())/1000)) : this.integer(row.age_seconds),
      enrollmentStatus: this.string(row.enrollment_status), enrollmentCurrentStep: this.nullableInteger(row.enrollment_current_step),
      contactId: this.nullableInteger(row.contact_id), contactName: [first,last].filter(Boolean).join(' ') || null,
    };
  }
  private redact(value: unknown): string { return String(value).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[redacted-email]').replace(/\+\d{7,15}\b/g,'[redacted-phone]').replace(/\b(?:re|sk|whsec|AC|SK)_[A-Za-z0-9_-]+\b/g,'[redacted-secret]').replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi,'[redacted-authorization]').replace(/\bsha256=[a-f0-9]{64}\b/gi,'[redacted-signature]').replace(/https?:\/\/\S+/gi,'[redacted-url]').slice(0,500); }
  private integer(value: unknown): number { const parsed=Number(value ?? 0); if(!Number.isSafeInteger(parsed)||parsed<0||parsed>2_147_483_647) throw new Error('Unsafe workflow execution integer'); return parsed; }
  private nullableInteger(value: unknown): number | null { return value === null || value === undefined ? null : this.integer(value); }
  private date(value: unknown): Date | null { if(value===null||value===undefined) return null; const date=new Date(value as string|number|Date); if(Number.isNaN(date.getTime())) throw new Error('Invalid workflow execution timestamp'); return date; }
  private requiredDate(value: unknown): Date { const date=this.date(value); if(!date) throw new Error('Missing workflow execution timestamp'); return date; }
  private string(value: unknown): string | null { return value === null || value === undefined ? null : String(value); }
  private ids(workflowId:number,sideEffectId:number):void { this.id(workflowId,'workflowId'); this.id(sideEffectId,'sideEffectId'); }
  private id(value:number,field:string):void { if(!Number.isSafeInteger(value)||value<1) this.invalid(field,'INVALID_WORKFLOW_EXECUTION_ID'); }
  private invalid(field:string,reason:string):never { throw itemizeGraphqlError('Invalid workflow execution request','BAD_USER_INPUT',{field,reason}); }
  private notFound():never { throw itemizeGraphqlError('Workflow not found','NOT_FOUND'); }
}
