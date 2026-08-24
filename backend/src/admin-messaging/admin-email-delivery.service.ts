import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { ADMIN_EMAIL_PROVIDER, AdminEmailProvider } from './admin-email.provider';
import { normalizeAdminEmailBaseUrl, renderAdminEmail } from './admin-email-renderer';
import { AdminEmailBatchInput, AdminEmailRecipientInput } from './admin-messaging.inputs';
import { AdminMessagingRepository } from './admin-messaging.repository';
import { AdminEmailBatchResult } from './admin-messaging.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class AdminEmailDeliveryService {
  constructor(
    private readonly repository: AdminMessagingRepository,
    @Inject(ADMIN_EMAIL_PROVIDER) private readonly provider: AdminEmailProvider,
  ) {}

  async enqueue(userId: number, input: AdminEmailBatchInput): Promise<AdminEmailBatchResult> {
    const subject = this.requiredText(input.subject, 255, 'input.subject');
    const bodyHtml = this.requiredText(input.bodyHtml, 500_000, 'input.bodyHtml');
    const key = String(input.idempotencyKey ?? '').trim();
    if (!KEY.test(key)) this.bad('idempotencyKey must be 1-128 safe ASCII characters', 'input.idempotencyKey');
    if (!Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > 500) {
      this.bad('Recipients must contain between 1 and 500 entries', 'input.recipients');
    }
    const recipients = input.recipients.map((recipient, index) => this.recipient(recipient, index));
    if (new Set(recipients.map((recipient) => recipient.email.toLowerCase())).size !== recipients.length) {
      this.bad('Recipients must not contain duplicate email addresses', 'input.recipients');
    }
    let baseUrl: string;
    try { baseUrl = normalizeAdminEmailBaseUrl(); }
    catch { throw new Error('FRONTEND_URL is invalid'); }
    const prepared = recipients.map((recipient) => {
      const variables = {
        userName: recipient.name || recipient.email.split('@')[0], userEmail: recipient.email,
        dashboardUrl: `${baseUrl}/dashboard`, unsubscribeUrl: `${baseUrl}/unsubscribe`,
      };
      const rendered = renderAdminEmail(subject, bodyHtml, variables, baseUrl);
      return { ...recipient, subject: rendered.subject, bodyHtml: rendered.html };
    });
    const fingerprint = createHash('sha256').update(JSON.stringify({ subject, bodyHtml, recipients })).digest('hex');
    const result = await this.repository.enqueue({ userId, idempotencyKey: key, fingerprint, subject, recipients: prepared });
    if (result.kind === 'key_conflict') {
      throw itemizeGraphqlError('idempotencyKey was already used for different email content', 'CONFLICT', {
        field: 'input.idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    return { batchId: result.batchId, status: result.status, accepted: result.accepted, replayed: result.kind === 'replayed' };
  }

  async runDue(limit = 100): Promise<{ attempted: number; sent: number }> {
    const due = await this.repository.due(Math.max(1, Math.min(limit, 500)));
    let sent = 0;
    for (const id of due) {
      const delivery = await this.repository.claim(id);
      if (!delivery) continue;
      try {
        const result = await this.provider.send({
          to: delivery.recipient_email, subject: delivery.subject, html: delivery.body_html,
          idempotencyKey: `admin-email:${delivery.batch_id}:${delivery.id}`,
        });
        if (result.kind === 'rejected') await this.repository.fail(id, result.message, false);
        else { await this.repository.complete(id, result.providerId); sent += 1; }
      } catch (error) {
        await this.repository.fail(id, error instanceof Error ? error.message : 'Unknown provider failure', true);
      }
    }
    return { attempted: due.length, sent };
  }

  private recipient(value: AdminEmailRecipientInput, index: number): { id?: number; email: string; name?: string } {
    const email = String(value?.email ?? '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL.test(email)) this.bad('Recipient email must be valid', `input.recipients[${index}].email`);
    if (value.id !== undefined && (!Number.isSafeInteger(value.id) || value.id < 1)) this.bad('Recipient ID must be positive', `input.recipients[${index}].id`);
    const name = this.optionalText(value.name, 255, `input.recipients[${index}].name`);
    return { ...(value.id ? { id: value.id } : {}), email, ...(name ? { name } : {}) };
  }

  private requiredText(value: string, max: number, field: string): string {
    const text = String(value ?? '').trim();
    if (!text || text.length > max) this.bad(`${field} must contain 1-${max} characters`, field);
    return text;
  }

  private optionalText(value: string | undefined, max: number, field: string): string | undefined {
    const text = value?.trim();
    if (!text) return undefined;
    if (text.length > max) this.bad(`${field} must be at most ${max} characters`, field);
    return text;
  }

  private bad(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }
}
