import { Inject, Injectable } from '@nestjs/common';
import { asRecord } from './workflow-enrollment.util';
import { boundedInteger } from './workflow-job.util';
import {
  WORKFLOW_EMAIL_PROVIDER,
  WORKFLOW_SMS_PROVIDER,
  WORKFLOW_WEBHOOK_PROVIDER,
  WorkflowDeliveryError,
  WorkflowEmailProvider,
  WorkflowSmsProvider,
  WorkflowWebhookProvider,
} from './workflow-side-effect.providers';
import { WorkflowSideEffectClaim, WorkflowSideEffectJobsRepository } from './workflow-side-effect-jobs.repository';

export type WorkflowSideEffectRun = {
  claimed: number; sent: number; retry: number; deadLetter: number; cancelled: number;
  reconciliationRequired: number; stale: number;
};

@Injectable()
export class WorkflowSideEffectJobsService {
  constructor(
    private readonly repository: WorkflowSideEffectJobsRepository,
    @Inject(WORKFLOW_EMAIL_PROVIDER) private readonly email: WorkflowEmailProvider,
    @Inject(WORKFLOW_SMS_PROVIDER) private readonly sms: WorkflowSmsProvider,
    @Inject(WORKFLOW_WEBHOOK_PROVIDER) private readonly webhook: WorkflowWebhookProvider,
  ) {}

  async run(options: {
    batchSize?: number; leaseSeconds?: number; maxAttempts?: number; baseDelayMs?: number;
    maximumDelayMs?: number; webhookTimeoutMs?: number; webhookMaxRequestBytes?: number;
    webhookMaxResponseBytes?: number; outboxId?: number | null;
  } = {}): Promise<WorkflowSideEffectRun> {
    const batchSize = boundedInteger(options.batchSize, 25, 1, 100);
    const leaseSeconds = boundedInteger(options.leaseSeconds, 300, 1, 3600);
    const maxAttempts = boundedInteger(options.maxAttempts, 5, 1, 20);
    const baseDelayMs = boundedInteger(options.baseDelayMs, 60_000, 1, 86_400_000);
    const maximumDelayMs = Math.max(baseDelayMs,
      boundedInteger(options.maximumDelayMs, 86_400_000, 1, 86_400_000));
    const webhookTimeoutMs = boundedInteger(options.webhookTimeoutMs, 10_000, 100, 60_000);
    const webhookMaxRequestBytes = boundedInteger(options.webhookMaxRequestBytes
      ?? process.env.WORKFLOW_WEBHOOK_MAX_REQUEST_BYTES, 256 * 1024, 1024, 1024 * 1024);
    const webhookMaxResponseBytes = boundedInteger(options.webhookMaxResponseBytes
      ?? process.env.WORKFLOW_WEBHOOK_MAX_RESPONSE_BYTES, 64 * 1024, 1024, 1024 * 1024);
    const summary: WorkflowSideEffectRun = {
      claimed: 0, sent: 0, retry: 0, deadLetter: 0, cancelled: 0,
      reconciliationRequired: await this.repository.quarantineExpiredSms(options.outboxId ?? null), stale: 0,
    };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await this.repository.claim(leaseSeconds, options.outboxId ?? null);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const result = await this.deliver(claim, {
          webhookTimeoutMs, webhookMaxRequestBytes, webhookMaxResponseBytes,
        });
        if (await this.repository.markSent(claim, result.providerId)) summary.sent += 1;
        else summary.stale += 1;
      } catch (error) {
        const typed = error as Error & { retryable?: boolean; providerOutcomeUnknown?: boolean };
        const outcome = await this.repository.markFailure(claim, error, {
          maxAttempts, baseDelayMs, maximumDelayMs,
          retryable: typed.retryable,
          providerOutcomeUnknown: typed.providerOutcomeUnknown,
        });
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else if (outcome === 'retry') summary.retry += 1;
        else if (outcome === 'cancelled') summary.cancelled += 1;
        else if (outcome === 'reconciliation_required') summary.reconciliationRequired += 1;
        else summary.stale += 1;
      }
      if (options.outboxId) break;
    }
    return summary;
  }

  private deliver(claim: WorkflowSideEffectClaim, limits: {
    webhookTimeoutMs: number; webhookMaxRequestBytes: number; webhookMaxResponseBytes: number;
  }): Promise<{ providerId: string | null }> {
    const payload = asRecord(claim.payload);
    if (claim.effect_type === 'email') {
      return this.email.send({
        to: this.required(payload, 'to'), subject: this.required(payload, 'subject'),
        html: String(payload.bodyHtml || ''),
        ...(payload.bodyText ? { text: String(payload.bodyText) } : {}),
        ...(payload.from ? { from: String(payload.from) } : {}),
        ...(payload.replyTo ? { replyTo: String(payload.replyTo) } : {}),
        tags: [
          claim.enrollment_id ? { name: 'workflow_enrollment_id', value: String(claim.enrollment_id) } : null,
          claim.step_id ? { name: 'workflow_step_id', value: String(claim.step_id) } : null,
        ].filter((tag): tag is { name: string; value: string } => Boolean(tag)),
        idempotencyKey: claim.idempotency_key,
      });
    }
    if (claim.effect_type === 'sms') {
      return this.sms.send({
        to: this.required(payload, 'to'), message: this.required(payload, 'message'),
        ...(payload.from ? { from: String(payload.from) } : {}),
      });
    }
    if (claim.effect_type === 'webhook') {
      return this.webhook.send({
        url: this.required(payload, 'url'), method: String(payload.method || 'POST'),
        headers: payload.headers, body: payload.body, idempotencyKey: claim.idempotency_key,
        timeoutMs: limits.webhookTimeoutMs, maxRequestBytes: limits.webhookMaxRequestBytes,
        maxResponseBytes: limits.webhookMaxResponseBytes,
      });
    }
    throw new WorkflowDeliveryError(`Unsupported workflow side-effect type: ${claim.effect_type}`, false);
  }

  private required(payload: Record<string, unknown>, field: string): string {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      throw new WorkflowDeliveryError(`Workflow side-effect payload is missing ${field}`);
    }
    return String(value);
  }
}
