import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { ReputationRequestFilterInput } from './reputation-request.inputs';
import { ReputationRequest, ReputationRequestPage } from './reputation-request.types';
import { ReputationRequestRow, ReputationRequestsRepository } from './reputation-requests.repository';

const STATUSES = new Set(['pending', 'sent', 'opened', 'clicked', 'completed', 'failed', 'unsubscribed']);

@Injectable()
export class ReputationRequestsService {
  constructor(private readonly repository: ReputationRequestsRepository) {}

  async list(
    organizationId: number,
    filter: ReputationRequestFilterInput = {},
    page?: PageInput,
  ): Promise<ReputationRequestPage> {
    const normalizedPage = this.normalizePage(page);
    const status = this.status(filter.status);
    const result = await this.repository.findPage({
      organizationId,
      ...(status ? { status } : {}),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, result.total),
    };
  }

  async delete(organizationId: number, requestId: number): Promise<number> {
    this.id(requestId);
    if (!(await this.repository.delete(organizationId, requestId))) {
      throw itemizeGraphqlError('Review request not found', 'NOT_FOUND');
    }
    return requestId;
  }

  private normalizePage(page?: PageInput): { page: number; pageSize: number; offset: number } {
    const pageNumber = Number(page?.page ?? 1);
    const pageSize = Number(page?.pageSize ?? 20);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      this.badInput('page must be a positive integer', 'page.page');
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      this.badInput('pageSize must be between 1 and 100', 'page.pageSize');
    }
    return { page: pageNumber, pageSize, offset: (pageNumber - 1) * pageSize };
  }

  private status(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'all') return undefined;
    if (!STATUSES.has(normalized)) this.badInput('status is invalid', 'filter.status');
    return normalized;
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      this.badInput('Review request ID must be a positive integer', 'id');
    }
  }

  private map(row: ReputationRequestRow): ReputationRequest {
    return {
      id: this.numberId(row.id, 'id'),
      organizationId: this.numberId(row.organization_id, 'organizationId'),
      contactId: this.nullableId(row.contact_id, 'contactId'),
      contactEmail: row.contact_email, contactPhone: row.contact_phone, contactName: row.contact_name,
      channel: row.channel, templateId: this.nullableId(row.template_id, 'templateId'),
      emailSent: row.email_sent === true, emailSentAt: this.nullableDate(row.email_sent_at, 'emailSentAt'),
      emailOpened: row.email_opened === true, emailOpenedAt: this.nullableDate(row.email_opened_at, 'emailOpenedAt'),
      smsSent: row.sms_sent === true, smsSentAt: this.nullableDate(row.sms_sent_at, 'smsSentAt'),
      clicked: row.clicked === true, clickedAt: this.nullableDate(row.clicked_at, 'clickedAt'),
      ratingGiven: this.nullableId(row.rating_given, 'ratingGiven'),
      reviewSubmitted: row.review_submitted === true,
      reviewSubmittedAt: this.nullableDate(row.review_submitted_at, 'reviewSubmittedAt'),
      reviewId: this.nullableId(row.review_id, 'reviewId'), preferredPlatform: row.preferred_platform,
      redirectUrl: row.redirect_url, status: row.status,
      scheduledAt: this.nullableDate(row.scheduled_at, 'scheduledAt'),
      expiresAt: this.nullableDate(row.expires_at, 'expiresAt'), customMessage: row.custom_message,
      createdAt: this.date(row.created_at, 'createdAt'), updatedAt: this.date(row.updated_at, 'updatedAt'),
      contactFirstName: row.contact_first_name, contactLastName: row.contact_last_name,
      currentContactEmail: row.current_contact_email,
    };
  }

  private numberId(value: number | string, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
      throw new Error(`Invalid reputation request ${field}`);
    }
    return parsed;
  }

  private nullableId(value: number | string | null, field: string): number | null {
    return value === null ? null : this.numberId(value, field);
  }

  private date(value: Date | string, field: string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid reputation request ${field}`);
    return date;
  }

  private nullableDate(value: Date | string | null, field: string): Date | null {
    return value === null ? null : this.date(value, field);
  }

  private badInput(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }
}
