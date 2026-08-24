import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CampaignFilterInput,
  CreateCampaignInput,
  ScheduleCampaignInput,
  UpdateCampaignInput,
} from './campaign.inputs';
import { Campaign, CampaignAudiencePreview, CampaignLink, CampaignPage, DeleteCampaignResult } from './campaign.types';
import {
  CampaignLinkRow,
  CampaignRow,
  CampaignsRepository,
  CampaignUpdates,
  CampaignValidationError,
} from './campaigns.repository';
import { AudienceValidationError } from './audience.compiler';

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed'];

@Injectable()
export class CampaignsService {
  constructor(private readonly campaigns: CampaignsRepository) {}

  async list(
    organizationId: number,
    filter: CampaignFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<CampaignPage> {
    const normalizedPage = this.page(page);
    const status = filter.status === undefined || filter.status === 'all'
      ? undefined
      : this.status(filter.status);
    const result = await this.campaigns.findPage({
      organizationId,
      ...(status === undefined ? {} : { status }),
      ...(filter.search === undefined ? {} : { searchPattern: this.search(filter.search) }),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    const total = this.count(result.total, 'campaigns.total');
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, total),
    };
  }

  async detail(organizationId: number, id: number): Promise<Campaign> {
    this.id(id);
    const result = await this.campaigns.findById(organizationId, id);
    if (!result) this.notFound();
    return this.map(result.row, result.links);
  }

  async audiencePreview(organizationId: number, id: number): Promise<CampaignAudiencePreview> {
    this.id(id);
    try {
      const result = await this.campaigns.previewAudience(organizationId, id);
      if (!result) this.notFound();
      return result;
    } catch (error) {
      if (error instanceof AudienceValidationError || error instanceof CampaignValidationError) {
        throw itemizeGraphqlError(error.message, 'BAD_USER_INPUT', {
          field: error.field, reason: 'INVALID_CAMPAIGN_AUDIENCE',
        });
      }
      throw error;
    }
  }

  async create(organizationId: number, userId: number, input: CreateCampaignInput): Promise<Campaign> {
    try {
      return this.map(await this.campaigns.create(organizationId, userId, {
        name: this.required(input.name, 'name', 255),
        subject: this.required(input.subject, 'subject', 500, false),
        fromName: this.optional(input.fromName, 'fromName', 255),
        fromEmail: this.optional(input.fromEmail, 'fromEmail', 255),
        replyTo: this.optional(input.replyTo, 'replyTo', 255),
        templateId: this.optionalId(input.templateId, 'templateId'),
        contentHtml: this.optional(input.contentHtml, 'contentHtml', 1_000_000, false),
        contentText: this.optional(input.contentText, 'contentText', 1_000_000, false),
        segmentType: this.segmentType(input.segmentType),
        segmentId: this.optionalId(input.segmentId, 'segmentId'),
        segmentFilter: this.jsonObject(input.segmentFilter ?? {}, 'segmentFilter'),
        tagIds: this.ids(input.tagIds, 'tagIds'),
        excludedTagIds: this.ids(input.excludedTagIds, 'excludedTagIds'),
      }));
    } catch (error) {
      return this.validation(error);
    }
  }

  async update(organizationId: number, id: number, input: UpdateCampaignInput): Promise<Campaign> {
    this.id(id);
    for (const field of ['name', 'subject', 'segmentType', 'tagIds', 'excludedTagIds'] as const) {
      if (input[field] === null) this.nullField(field);
    }
    const updates: CampaignUpdates = {
      ...(input.name === undefined ? {} : { name: this.required(input.name as string, 'name', 255) }),
      ...(input.subject === undefined ? {} : { subject: this.required(input.subject as string, 'subject', 500, false) }),
      ...(input.fromName === undefined ? {} : { fromName: this.optional(input.fromName, 'fromName', 255) }),
      ...(input.fromEmail === undefined ? {} : { fromEmail: this.optional(input.fromEmail, 'fromEmail', 255) }),
      ...(input.replyTo === undefined ? {} : { replyTo: this.optional(input.replyTo, 'replyTo', 255) }),
      ...(input.templateId === undefined ? {} : { templateId: this.optionalId(input.templateId, 'templateId') }),
      ...(input.contentHtml === undefined ? {} : { contentHtml: this.optional(input.contentHtml, 'contentHtml', 1_000_000, false) }),
      ...(input.contentText === undefined ? {} : { contentText: this.optional(input.contentText, 'contentText', 1_000_000, false) }),
      ...(input.segmentType === undefined ? {} : { segmentType: this.segmentType(input.segmentType as string) }),
      ...(input.segmentId === undefined ? {} : { segmentId: this.optionalId(input.segmentId, 'segmentId') }),
      ...(input.segmentFilter === undefined ? {} : {
        segmentFilter: this.jsonObject(input.segmentFilter ?? {}, 'segmentFilter'),
      }),
      ...(input.tagIds === undefined ? {} : { tagIds: this.ids(input.tagIds as number[], 'tagIds') }),
      ...(input.excludedTagIds === undefined ? {} : {
        excludedTagIds: this.ids(input.excludedTagIds as number[], 'excludedTagIds'),
      }),
    };
    try {
      const result = await this.campaigns.update(organizationId, id, updates);
      return this.outcome(result, 'Campaign cannot be edited in its current state');
    } catch (error) {
      return this.validation(error);
    }
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<Campaign> {
    this.id(id);
    const row = await this.campaigns.duplicate(organizationId, id, userId);
    if (!row) this.notFound();
    return this.map(row);
  }

  async delete(organizationId: number, id: number): Promise<DeleteCampaignResult> {
    this.id(id);
    const result = await this.campaigns.delete(organizationId, id);
    if (result.kind === 'not_found') this.notFound();
    if (result.kind === 'invalid_status') this.invalidState('Campaign cannot be deleted while sending', result.status);
    return { deletedId: id, success: true };
  }

  async schedule(organizationId: number, id: number, input: ScheduleCampaignInput): Promise<Campaign> {
    this.id(id);
    if (typeof input.scheduledAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(input.scheduledAt) ||
        Number.isNaN(Date.parse(input.scheduledAt))) {
      throw itemizeGraphqlError('scheduledAt must be an absolute ISO-8601 timestamp', 'BAD_USER_INPUT', {
        field: 'scheduledAt', reason: 'INVALID_CAMPAIGN_SCHEDULE',
      });
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      throw itemizeGraphqlError('scheduledAt must be in the future', 'BAD_USER_INPUT', {
        field: 'scheduledAt', reason: 'CAMPAIGN_SCHEDULE_NOT_FUTURE',
      });
    }
    const timezone = this.required(input.timezone, 'timezone', 100);
    const result = await this.campaigns.schedule(organizationId, id, scheduledAt, timezone);
    return this.outcome(result, 'Campaign cannot be scheduled in its current state');
  }

  async unschedule(organizationId: number, id: number): Promise<Campaign> {
    this.id(id);
    const result = await this.campaigns.unschedule(organizationId, id);
    return this.outcome(result, 'Only a scheduled campaign can be unscheduled');
  }

  private outcome(
    result: Awaited<ReturnType<CampaignsRepository['update']>>,
    message: string,
  ): Campaign {
    if (result.kind === 'not_found') this.notFound();
    if (result.kind === 'invalid_status') this.invalidState(message, result.status);
    return this.map(result.row);
  }

  private page(input: PageInput) {
    if (!Number.isInteger(input.page) || input.page < 1 ||
        !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page', reason: 'INVALID_PAGE',
      });
    }
    return { page: input.page, pageSize: input.pageSize, offset: (input.page - 1) * input.pageSize };
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', {
        field: 'id', reason: 'INVALID_CAMPAIGN_ID',
      });
    }
  }

  private required(value: string, field: string, max: number, trim = true): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
      throw itemizeGraphqlError(`${field} is required and must not exceed ${max} characters`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_CAMPAIGN_${field.toUpperCase()}`,
      });
    }
    return trim ? value.trim() : value;
  }

  private optional(value: string | null | undefined, field: string, max: number, trim = true): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > max) {
      throw itemizeGraphqlError(`${field} must not exceed ${max} characters`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_CAMPAIGN_${field.toUpperCase()}`,
      });
    }
    return trim ? value.trim() : value;
  }

  private optionalId(value: number | null | undefined, field: string): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_CAMPAIGN_${field.toUpperCase()}`,
      });
    }
    return value;
  }

  private ids(value: number[], field: string): number[] {
    if (!Array.isArray(value) || value.length > 100 ||
        value.some((id) => !Number.isSafeInteger(id) || id < 1) ||
        new Set(value).size !== value.length) {
      throw itemizeGraphqlError(`${field} must contain at most 100 unique positive IDs`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_CAMPAIGN_${field.toUpperCase()}`,
      });
    }
    return value;
  }

  private jsonObject(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(`${field} must be a JSON object`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_CAMPAIGN_JSON',
      });
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw itemizeGraphqlError(`${field} must be JSON serializable`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_CAMPAIGN_JSON',
      });
    }
    if (Buffer.byteLength(serialized, 'utf8') > 65_536) {
      throw itemizeGraphqlError(`${field} is too large`, 'BAD_USER_INPUT', {
        field, reason: 'CAMPAIGN_JSON_TOO_LARGE',
      });
    }
    return value as Record<string, unknown>;
  }

  private segmentType(value: string): string {
    if (!['all', 'tag', 'status', 'segment'].includes(value)) {
      throw itemizeGraphqlError('segmentType is unsupported', 'BAD_USER_INPUT', {
        field: 'segmentType', reason: 'UNSUPPORTED_CAMPAIGN_SEGMENT_TYPE',
      });
    }
    return value;
  }

  private status(value: string): string {
    if (!CAMPAIGN_STATUSES.includes(value)) {
      throw itemizeGraphqlError('status is invalid', 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_CAMPAIGN_STATUS',
      });
    }
    return value;
  }

  private search(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError('search must be between 1 and 100 characters', 'BAD_USER_INPUT', {
        field: 'search', reason: 'INVALID_CAMPAIGN_SEARCH',
      });
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private count(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
      throw new Error(`Unsafe campaign count at ${field}`);
    }
    return parsed;
  }

  private rate(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Unsafe campaign rate at ${field}`);
    return parsed;
  }

  private validation(error: unknown): never {
    if (error instanceof CampaignValidationError) {
      throw itemizeGraphqlError(error.message, 'BAD_USER_INPUT', {
        field: error.field, reason: 'INVALID_CAMPAIGN_REFERENCE',
      });
    }
    throw error;
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field, reason: 'NULL_CAMPAIGN_FIELD',
    });
  }

  private invalidState(message: string, status: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', {
      field: 'status', reason: 'INVALID_CAMPAIGN_STATE', actualStatus: status,
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Campaign not found', 'NOT_FOUND');
  }

  private mapLink(row: CampaignLinkRow): CampaignLink {
    return {
      id: Number(row.id), campaignId: Number(row.campaign_id), originalUrl: row.original_url,
      trackingUrl: row.tracking_url, linkText: row.link_text,
      linkPosition: row.link_position === null ? null : Number(row.link_position),
      totalClicks: this.count(row.total_clicks, 'campaignLink.totalClicks'),
      uniqueClicks: this.count(row.unique_clicks, 'campaignLink.uniqueClicks'),
      createdAt: new Date(row.created_at),
    };
  }

  private map(row: CampaignRow, links: CampaignLinkRow[] = []): Campaign {
    const json = row.segment_filter && typeof row.segment_filter === 'object' && !Array.isArray(row.segment_filter)
      ? row.segment_filter as Record<string, unknown>
      : {};
    return {
      id: Number(row.id), organizationId: Number(row.organization_id), name: row.name,
      subject: row.subject, fromName: row.from_name, fromEmail: row.from_email,
      replyTo: row.reply_to, templateId: row.template_id === null ? null : Number(row.template_id),
      contentHtml: row.content_html, contentText: row.content_text, segmentType: row.segment_type,
      segmentId: row.segment_id === null ? null : Number(row.segment_id), segmentFilter: json,
      tagIds: (row.tag_ids ?? []).map(Number), excludedTagIds: (row.excluded_tag_ids ?? []).map(Number),
      status: row.status || 'draft', scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      sendImmediately: row.send_immediately === true, timezone: row.timezone || 'UTC',
      isAbTest: row.is_ab_test === true,
      abVariants: row.ab_variants, abWinnerCriteria: row.ab_winner_criteria,
      abTestDurationHours: row.ab_test_duration_hours === null ? null : Number(row.ab_test_duration_hours),
      totalRecipients: this.count(row.total_recipients, 'campaign.totalRecipients'),
      totalSent: this.count(row.total_sent, 'campaign.totalSent'),
      totalDelivered: this.count(row.total_delivered, 'campaign.totalDelivered'),
      totalOpened: this.count(row.total_opened, 'campaign.totalOpened'),
      totalClicked: this.count(row.total_clicked, 'campaign.totalClicked'),
      totalBounced: this.count(row.total_bounced, 'campaign.totalBounced'),
      totalUnsubscribed: this.count(row.total_unsubscribed, 'campaign.totalUnsubscribed'),
      totalComplained: this.count(row.total_complained, 'campaign.totalComplained'),
      openRate: this.rate(row.open_rate, 'campaign.openRate'),
      clickRate: this.rate(row.click_rate, 'campaign.clickRate'),
      bounceRate: this.rate(row.bounce_rate, 'campaign.bounceRate'),
      createdById: row.created_by === null ? null : Number(row.created_by),
      sentById: row.sent_by === null ? null : Number(row.sent_by),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
      templateName: row.template_name ?? null, templateHtml: row.template_html ?? null,
      createdByName: row.created_by_name ?? null, sentByName: row.sent_by_name ?? null,
      links: links.map((link) => this.mapLink(link)),
    };
  }
}
