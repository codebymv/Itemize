import { Inject, Injectable } from '@nestjs/common';
import {
  WORKFLOW_EMAIL_PROVIDER,
  WorkflowEmailProvider,
} from '../workflow-jobs/workflow-side-effect.providers';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { renderSignatureDeliveryEmail } from './signature-delivery.email';
import {
  SignatureDeliveryClaim,
  SignatureDeliveryJobsRepository,
} from './signature-delivery-jobs.repository';

export type SignatureDeliveryRun = {
  remindersQueued: number;
  claimed: number;
  sent: number;
  retry: number;
  deadLetter: number;
  cancelled: number;
  stale: number;
};

@Injectable()
export class SignatureDeliveryJobsService {
  constructor(
    private readonly repository: SignatureDeliveryJobsRepository,
    @Inject(WORKFLOW_EMAIL_PROVIDER) private readonly email: WorkflowEmailProvider,
  ) {}

  async run(options: {
    batchSize?: number;
    reminderBatchSize?: number;
    leaseSeconds?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    maximumDelayMs?: number;
    outboxId?: number | null;
  } = {}): Promise<SignatureDeliveryRun> {
    const batchSize = boundedInteger(options.batchSize, 25, 1, 100);
    const reminderBatchSize = boundedInteger(options.reminderBatchSize, 25, 1, 100);
    const leaseSeconds = boundedInteger(options.leaseSeconds, 300, 1, 3600);
    const maxAttempts = boundedInteger(options.maxAttempts, 5, 1, 20);
    const baseDelayMs = boundedInteger(options.baseDelayMs, 60_000, 1, 86_400_000);
    const maximumDelayMs = Math.max(
      baseDelayMs,
      boundedInteger(options.maximumDelayMs, 86_400_000, 1, 86_400_000),
    );
    const summary: SignatureDeliveryRun = {
      remindersQueued: options.outboxId
        ? 0
        : await this.repository.enqueueDueReminders(reminderBatchSize),
      claimed: 0,
      sent: 0,
      retry: 0,
      deadLetter: 0,
      cancelled: 0,
      stale: 0,
    };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await this.repository.claim(leaseSeconds, options.outboxId ?? null);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const result = await this.deliver(claim);
        if (await this.repository.markSent(claim, result.providerId)) summary.sent += 1;
        else summary.cancelled += 1;
      } catch (error) {
        const typed = error as Error & { retryable?: boolean };
        const outcome = await this.repository.markFailure(claim, error, {
          maxAttempts,
          baseDelayMs,
          maximumDelayMs,
          retryable: typed.retryable,
        });
        if (outcome === 'retry') summary.retry += 1;
        else if (outcome === 'dead_letter') summary.deadLetter += 1;
        else if (outcome === 'cancelled') summary.cancelled += 1;
        else summary.stale += 1;
      }
      if (options.outboxId) break;
    }
    return summary;
  }

  private deliver(claim: SignatureDeliveryClaim): Promise<{ providerId: string | null }> {
    const payload = claim.payload;
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('Signature delivery payload is invalid'), { retryable: false });
    }
    const to = String(payload.to || '').trim();
    const documentTitle = String(payload.documentTitle || '').trim();
    if (!to || !documentTitle) {
      throw Object.assign(
        new Error('Signature delivery payload is missing required fields'),
        { retryable: false },
      );
    }
    const rendered = renderSignatureDeliveryEmail(
      claim.delivery_type,
      claim.idempotency_key,
      payload,
    );
    return this.email.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      tags: [
        { name: 'signature_document_id', value: String(claim.document_id) },
        ...(claim.recipient_id
          ? [{ name: 'signature_recipient_id', value: String(claim.recipient_id) }]
          : []),
      ],
      idempotencyKey: claim.idempotency_key,
    });
  }
}
