import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { normalizeAdminEmailBaseUrl, renderAdminEmail } from './admin-email-renderer';
import {
  AdminEmailLogFilterInput, AdminEmailPreviewInput, AdminEmailTemplateFilterInput,
} from './admin-messaging.inputs';
import { AdminEmailLogRow, AdminEmailTemplateRow, AdminMessagingRepository } from './admin-messaging.repository';
import {
  AdminEmailLog, AdminEmailLogPage, AdminEmailPreview,
  AdminEmailTemplate, AdminEmailTemplatePage,
} from './admin-messaging.types';

const LOG_STATUSES = new Set(['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed']);

@Injectable()
export class AdminMessagingService {
  constructor(private readonly repository: AdminMessagingRepository) {}

  async logs(input: AdminEmailLogFilterInput = {}): Promise<AdminEmailLogPage> {
    const page = input.page ?? 0;
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(page) || page < 0) this.bad('Page must be a non-negative integer', 'input.page');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) this.bad('Limit must be between 1 and 100', 'input.limit');
    const status = input.status?.trim().toLowerCase();
    if (status && !LOG_STATUSES.has(status)) this.bad('Unknown email status', 'input.status');
    const result = await this.repository.logs({ status: status || undefined, limit, offset: page * limit });
    return { logs: result.rows.slice(0, limit).map(this.mapLog), total: result.total, hasMore: result.rows.length > limit };
  }

  async log(id: number): Promise<AdminEmailLog> {
    if (!Number.isSafeInteger(id) || id < 1) this.bad('Email log ID must be a positive integer', 'id');
    const row = await this.repository.log(id);
    if (!row) throw itemizeGraphqlError('Email log not found', 'NOT_FOUND', { reason: 'ADMIN_EMAIL_LOG_NOT_FOUND' });
    return this.mapLog(row);
  }

  async templates(input: AdminEmailTemplateFilterInput = {}): Promise<AdminEmailTemplatePage> {
    const category = this.optionalText(input.category, 100, 'input.category');
    const search = this.optionalText(input.search, 255, 'input.search');
    const result = await this.repository.templates({ category, search });
    return { templates: result.rows.map(this.mapTemplate), total: result.total };
  }

  preview(input: AdminEmailPreviewInput): AdminEmailPreview {
    const subject = this.requiredText(input.subject, 255, 'input.subject');
    const bodyHtml = this.requiredText(input.bodyHtml, 500_000, 'input.bodyHtml');
    let baseUrl: string;
    try { baseUrl = normalizeAdminEmailBaseUrl(input.baseUrl); }
    catch { return this.bad('baseUrl must be a valid HTTP(S) origin', 'input.baseUrl'); }
    return renderAdminEmail(subject, bodyHtml, {
      userName: 'John Doe', userEmail: 'john@example.com',
      dashboardUrl: `${baseUrl}/dashboard`, unsubscribeUrl: `${baseUrl}/unsubscribe`,
    }, baseUrl);
  }

  private readonly mapLog = (row: AdminEmailLogRow): AdminEmailLog => ({
    id: Number(row.id), recipientEmail: row.recipient_email, recipientId: row.recipient_id === null ? null : Number(row.recipient_id),
    recipientName: row.recipient_name, subject: row.subject, bodyHtml: row.body_html, status: row.status,
    externalId: row.external_id, errorMessage: row.error_message, sentBy: row.sent_by === null ? null : Number(row.sent_by),
    sentByName: row.sent_by_name, sentByEmail: row.sent_by_email, sentAt: row.sent_at, createdAt: row.created_at,
  });

  private readonly mapTemplate = (row: AdminEmailTemplateRow): AdminEmailTemplate => ({
    id: Number(row.id), name: row.name, subject: row.subject, bodyHtml: row.body_html || '', category: row.category || 'general',
    isActive: row.is_active, organizationId: row.organization_id === null ? null : Number(row.organization_id),
    organizationName: row.organization_name, createdBy: row.created_by === null ? null : Number(row.created_by),
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  });

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
