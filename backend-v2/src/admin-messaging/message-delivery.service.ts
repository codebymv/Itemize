import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import { itemizeGraphqlError } from '../common/graphql-error';
import { smsMessageInfo } from '../sms-templates/sms-message-info';
import {
  EnqueueContactEmailInput,
  EnqueueContactSmsInput,
  SendEmailTemplateTestInput,
  SendSmsTemplateTestInput,
} from './message-delivery.inputs';
import {
  MESSAGE_EMAIL_PROVIDER,
  MESSAGE_SMS_PROVIDER,
  MessageEmailProvider,
  MessageSmsProvider,
} from './message-delivery.providers';
import {
  DeliveryContact,
  MessageDeliveryJobRow,
  MessageDeliveryPayload,
  MessageDeliveryRepository,
  Prepared,
} from './message-delivery.repository';
import { MessageDelivery } from './message-delivery.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class MessageDeliveryService {
  constructor(
    private readonly repository: MessageDeliveryRepository,
    @Inject(MESSAGE_EMAIL_PROVIDER) private readonly emailProvider: MessageEmailProvider,
    @Inject(MESSAGE_SMS_PROVIDER) private readonly smsProvider: MessageSmsProvider,
  ) {}

  async enqueueContactEmail(
    organizationId: number,
    userId: number,
    input: EnqueueContactEmailInput,
  ): Promise<MessageDelivery> {
    const contactId = this.id(input.contactId, 'input.contactId');
    const templateId = this.optionalId(input.templateId, 'input.templateId');
    const key = this.key(input.idempotencyKey);
    const replyTo = this.optionalEmail(input.replyTo, 'input.replyTo');
    const subject = templateId
      ? this.optional(input.subject, 500, 'input.subject', false)
      : this.required(input.subject, 500, 'input.subject', false);
    const bodyHtml = templateId
      ? this.optional(input.bodyHtml, 1_000_000, 'input.bodyHtml', false)
      : this.required(input.bodyHtml, 1_000_000, 'input.bodyHtml', false);
    const bodyText = this.optional(input.bodyText, 1_000_000, 'input.bodyText', false);
    if (templateId && (subject !== undefined || bodyHtml !== undefined || bodyText !== undefined)) {
      this.bad('Custom content cannot be combined with templateId', 'input.templateId');
    }
    const fingerprint = this.fingerprint({
      operation: 'contact_email', contactId, templateId, subject, bodyHtml, bodyText, replyTo,
    });
    const result = await this.repository.enqueueContactEmail(
      { organizationId, userId, idempotencyKey: key, fingerprint, contactId, templateId },
      (contact, template, organizationName) => {
        const data = this.contactData(contact);
        const renderedSubject = this.required(
          this.render(template?.subject ?? subject!, data),
          500,
          'renderedSubject',
          false,
        );
        const renderedBody = this.required(
          this.render(template?.body_html ?? bodyHtml!, data),
          1_000_000,
          'renderedBodyHtml',
          false,
        );
        const renderedHtml = this.wrapEmail(
          renderedBody,
          renderedSubject,
        );
        const renderedText = this.renderOptional(template?.body_text ?? bodyText, data);
        if (renderedText && renderedText.length > 1_000_000) {
          this.bad('Rendered body text must not exceed 1000000 characters', 'input.bodyText');
        }
        return {
          to: this.email(contact.email!, 'contact.email'),
          from: process.env.EMAIL_FROM?.trim() ||
            `${organizationName} <noreply@itemize.cloud>`,
          subject: renderedSubject,
          html: renderedHtml,
          text: renderedText,
          replyTo,
          templateName: template?.name ?? null,
        };
      },
    );
    return this.result(result);
  }

  async enqueueContactSms(
    organizationId: number,
    userId: number,
    input: EnqueueContactSmsInput,
  ): Promise<MessageDelivery> {
    const contactId = this.id(input.contactId, 'input.contactId');
    const templateId = this.optionalId(input.templateId, 'input.templateId');
    const key = this.key(input.idempotencyKey);
    const customMessage = templateId
      ? this.optional(input.message, 1600, 'input.message', false)
      : this.required(input.message, 1600, 'input.message', false);
    if (templateId && customMessage !== undefined) {
      this.bad('Custom message cannot be combined with templateId', 'input.templateId');
    }
    const fingerprint = this.fingerprint({
      operation: 'contact_sms', contactId, templateId, message: customMessage,
    });
    const result = await this.repository.enqueueContactSms(
      { organizationId, userId, idempotencyKey: key, fingerprint, contactId, templateId },
      (contact, template) => {
        const message = this.required(
          this.render(template?.message ?? customMessage!, this.contactData(contact)),
          1600,
          'renderedMessage',
          false,
        );
        return {
          to: this.phone(contact.phone!, 'contact.phone'),
          from: process.env.TWILIO_PHONE_NUMBER?.trim() ?? '',
          message,
          segments: smsMessageInfo(message).segments,
          templateName: template?.name ?? null,
        };
      },
    );
    return this.result(result);
  }

  async sendEmailTemplateTest(
    organizationId: number,
    userId: number,
    input: SendEmailTemplateTestInput,
  ): Promise<MessageDelivery> {
    const templateId = this.id(input.templateId, 'input.templateId');
    const to = this.email(input.toEmail, 'input.toEmail');
    const sampleData = this.sampleData(input.sampleData);
    const key = this.key(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      operation: 'test_email', templateId, to, sampleData,
    });
    const result = await this.repository.enqueueTestEmail(
      { organizationId, userId, idempotencyKey: key, fingerprint, templateId },
      (template, organizationName) => {
        const data = { ...this.defaultSample(), ...sampleData };
        const subject = this.required(
          `[TEST] ${this.render(template.subject, data)}`,
          500,
          'renderedSubject',
          false,
        );
        const renderedBody = this.required(
          this.render(template.body_html, data),
          1_000_000,
          'renderedBodyHtml',
          false,
        );
        return {
          to,
          from: process.env.EMAIL_FROM?.trim() ||
            `${organizationName} <noreply@itemize.cloud>`,
          subject,
          html: this.wrapEmail(
            `<div style="padding:10px;background:#fef3c7;color:#92400e;font-weight:600">TEST EMAIL</div>${renderedBody}`,
            subject,
          ),
          text: this.renderOptional(template.body_text, data),
          templateName: template.name,
        };
      },
    );
    return this.result(result);
  }

  async sendSmsTemplateTest(
    organizationId: number,
    userId: number,
    input: SendSmsTemplateTestInput,
  ): Promise<MessageDelivery> {
    const templateId = this.id(input.templateId, 'input.templateId');
    const to = this.phone(input.toPhone, 'input.toPhone');
    const sampleData = this.sampleData(input.sampleData);
    const key = this.key(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      operation: 'test_sms', templateId, to, sampleData,
    });
    const result = await this.repository.enqueueTestSms(
      { organizationId, userId, idempotencyKey: key, fingerprint, templateId },
      (template) => {
        const message = `[TEST] ${this.render(
          template.message,
          { ...this.defaultSample(), ...sampleData },
        )}`;
        if (message.length > 1600) {
          this.bad('Rendered test message must not exceed 1600 characters', 'input.sampleData');
        }
        return {
          to,
          from: process.env.TWILIO_PHONE_NUMBER?.trim() ?? '',
          message,
          segments: smsMessageInfo(message).segments,
          templateName: template.name,
        };
      },
    );
    return this.result(result);
  }

  async runDue(limit = 100): Promise<{
    attempted: number;
    accepted: number;
    failed: number;
    reconciliationRequired: number;
  }> {
    const due = await this.repository.dueIds(Math.max(1, Math.min(limit, 500)));
    let accepted = 0;
    let failed = 0;
    let reconciliationRequired = 0;
    for (const candidate of due) {
      const job = await this.repository.claim(candidate.organizationId, candidate.id);
      if (!job) continue;
      try {
        const result = job.channel === 'email'
          ? await this.emailProvider.send({
            to: job.payload.to,
            from: job.payload.from,
            subject: job.payload.subject!,
            html: job.payload.html!,
            text: job.payload.text,
            replyTo: job.payload.replyTo,
            idempotencyKey: `message-delivery:${job.organization_id}:${job.id}`,
            tags: this.tags(job),
          })
          : await this.smsProvider.send({
            to: job.payload.to,
            from: job.payload.from,
            message: job.payload.message!,
          });
        if (result.kind === 'accepted') {
          await this.repository.complete(job.organization_id, job.id, result.providerId);
          accepted += 1;
        } else if (result.kind === 'reconciliation') {
          await this.repository.reconciliation(job.organization_id, job.id, result.message);
          reconciliationRequired += 1;
        } else {
          await this.repository.fail(job.organization_id, job.id, result.message, false);
          failed += 1;
        }
      } catch (error) {
        await this.repository.fail(
          job.organization_id,
          job.id,
          error instanceof Error ? error.message : 'Unknown provider failure',
          true,
        );
        failed += 1;
      }
    }
    return { attempted: due.length, accepted, failed, reconciliationRequired };
  }

  private result(result: Prepared): MessageDelivery {
    if (result.kind === 'key_conflict') {
      throw itemizeGraphqlError(
        'idempotencyKey was already used for a different delivery',
        'CONFLICT',
        { field: 'input.idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
      );
    }
    if (result.kind === 'contact_not_found') this.notFound('Contact');
    if (result.kind === 'template_not_found') this.notFound('Template');
    if (result.kind === 'missing_email') {
      this.bad('Contact does not have an email address', 'input.contactId');
    }
    if (result.kind === 'email_suppressed') {
      throw itemizeGraphqlError('Contact email is suppressed', 'CONFLICT', {
        field: 'input.contactId',
        reason: 'EMAIL_SUPPRESSED',
      });
    }
    if (result.kind === 'missing_phone') {
      this.bad('Contact does not have a phone number', 'input.contactId');
    }
    if (result.kind === 'usage_exhausted') {
      throw itemizeGraphqlError('Messaging usage limit has been reached', 'FORBIDDEN', {
        reason: 'MESSAGING_USAGE_EXHAUSTED',
      });
    }
    if (result.kind !== 'created' && result.kind !== 'replayed') {
      throw new Error(`Unhandled message delivery preparation result: ${result.kind}`);
    }
    return this.map(result.job, result.kind === 'replayed');
  }

  private map(row: MessageDeliveryJobRow, replayed: boolean): MessageDelivery {
    return {
      id: Number(row.id),
      kind: row.kind,
      channel: row.channel,
      status: row.status,
      accepted: true,
      replayed,
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      templateId: row.email_template_id === null
        ? (row.sms_template_id === null ? null : Number(row.sms_template_id))
        : Number(row.email_template_id),
      providerId: row.provider_id,
      createdAt: new Date(row.created_at),
    };
  }

  private contactData(contact: DeliveryContact): Record<string, unknown> {
    return {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'there',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      job_title: contact.job_title || '',
      ...(contact.custom_fields ?? {}),
    };
  }

  private defaultSample(): Record<string, unknown> {
    return {
      first_name: 'Test',
      last_name: 'Recipient',
      full_name: 'Test Recipient',
      email: 'test@example.com',
      phone: '+15555550100',
      company: 'Example Company',
      job_title: 'Customer',
    };
  }

  private render(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      data[key] === undefined ? match : String(data[key]));
  }

  private renderOptional(
    template: string | null | undefined,
    data: Record<string, unknown>,
  ): string | null {
    return template ? this.render(template, data) : null;
  }

  private wrapEmail(html: string, subject: string): string {
    const lower = html.toLowerCase();
    if (lower.includes('<!doctype') || lower.includes('<html')) return html;
    return brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: subject,
      heading: subject,
      bodyHtml: html,
      footerText: 'Sent with Itemize.',
    });
  }

  private tags(job: MessageDeliveryJobRow): Array<{ name: string; value: string }> {
    return [
      { name: 'organization_id', value: String(job.organization_id) },
      ...(job.contact_id ? [{ name: 'contact_id', value: String(job.contact_id) }] : []),
      ...(job.email_template_id
        ? [{ name: 'template_id', value: String(job.email_template_id) }]
        : []),
    ];
  }

  private key(value: string): string {
    const key = String(value ?? '').trim();
    if (!KEY.test(key)) {
      this.bad('idempotencyKey must be 1-128 safe ASCII characters', 'input.idempotencyKey');
    }
    return key;
  }

  private id(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      this.bad(`${field} must be a positive integer`, field);
    }
    return value;
  }

  private optionalId(value: number | null | undefined, field: string): number | null {
    return value === null || value === undefined ? null : this.id(value, field);
  }

  private email(value: string, field: string): string {
    const email = String(value ?? '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      this.bad(`${field} must be a valid email address`, field);
    }
    return email;
  }

  private optionalEmail(value: string | null | undefined, field: string): string | null {
    return value === null || value === undefined || value.trim() === ''
      ? null
      : this.email(value, field);
  }

  private phone(value: string, field: string): string {
    let normalized = String(value ?? '').trim().replace(/[^\d+]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
    }
    if (!E164.test(normalized)) this.bad(`${field} must be a valid phone number`, field);
    return normalized;
  }

  private required(
    value: string | null | undefined,
    max: number,
    field: string,
    trim = true,
  ): string {
    const text = String(value ?? '');
    if (!text.trim() || text.length > max) {
      this.bad(`${field} must contain 1-${max} characters`, field);
    }
    return trim ? text.trim() : text;
  }

  private optional(
    value: string | null | undefined,
    max: number,
    field: string,
    trim = true,
  ): string | undefined {
    if (value === null || value === undefined || value.length === 0) return undefined;
    if (value.length > max) this.bad(`${field} must be at most ${max} characters`, field);
    return trim ? value.trim() : value;
  }

  private sampleData(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
      this.bad('sampleData must be an object', 'input.sampleData');
    }
    if (JSON.stringify(value).length > 10_000) {
      this.bad('sampleData must not exceed 10,000 characters', 'input.sampleData');
    }
    for (const [key, item] of Object.entries(value)) {
      if (!/^\w+$/.test(key) || !['string', 'number', 'boolean'].includes(typeof item)) {
        this.bad('sampleData must contain only scalar values with safe keys', 'input.sampleData');
      }
    }
    return value;
  }

  private fingerprint(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private bad(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }

  private notFound(label: string): never {
    throw itemizeGraphqlError(`${label} not found`, 'NOT_FOUND');
  }
}
