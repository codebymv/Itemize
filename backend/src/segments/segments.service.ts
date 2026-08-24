import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import {
  AudienceValidationError,
  SegmentDefinition,
  normalizeSegmentDefinition,
} from '../campaigns/audience.compiler';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateSegmentInput,
  PreviewSegmentInput,
  SegmentFilterRuleInput,
  SegmentListFilterInput,
  UpdateSegmentInput,
} from './segment.inputs';
import {
  Segment,
  SegmentContact,
  SegmentContactPage,
  SegmentFilterOptions,
  SegmentHistory,
  SegmentPage,
  SegmentPreview,
} from './segment.types';
import {
  SegmentContactRow,
  SegmentHistoryRow,
  SegmentRow,
  SegmentValues,
  SegmentsRepository,
} from './segments.repository';

const FILTER_FIELDS = [
  { id: 'status', label: 'Status', type: 'select', operators: ['equals', 'not_equals', 'in'], options: ['active', 'inactive', 'archived'] },
  { id: 'source', label: 'Source', type: 'text', operators: ['equals', 'contains', 'is_empty', 'is_not_empty'] },
  { id: 'email', label: 'Email', type: 'text', operators: ['contains', 'ends_with', 'is_empty', 'is_not_empty'] },
  { id: 'phone', label: 'Phone', type: 'text', operators: ['contains', 'is_empty', 'is_not_empty'] },
  { id: 'tags', label: 'Tags', type: 'tags', operators: ['has_any', 'has_all', 'has_none'] },
  { id: 'created_at', label: 'Created Date', type: 'date', operators: ['after', 'before', 'between', 'last_n_days'] },
  { id: 'last_activity', label: 'Last Activity', type: 'number', operators: ['last_n_days', 'no_activity_days'] },
  { id: 'email_engagement', label: 'Email Engagement', type: 'select', operators: ['opened_campaign', 'never_opened', 'clicked_link'] },
  { id: 'email_unsubscribed', label: 'Unsubscribed', type: 'boolean', operators: ['equals'] },
  { id: 'assigned_to', label: 'Assigned To', type: 'user', operators: ['equals', 'is_empty', 'is_not_empty'] },
  { id: 'deal_stage', label: 'Deal Stage', type: 'stage', operators: ['in_stage', 'has_open_deal', 'won_deal', 'lost_deal'] },
  { id: 'booking', label: 'Booking', type: 'select', operators: ['has_upcoming', 'completed', 'no_show'] },
  { id: 'custom_field', label: 'Custom Field', type: 'custom', operators: ['equals', 'contains', 'is_empty', 'is_not_empty'] },
];

@Injectable()
export class SegmentsService {
  constructor(private readonly repository: SegmentsRepository) {}

  async list(
    organizationId: number,
    filter: SegmentListFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<SegmentPage> {
    const normalizedPage = this.normalizePage(page);
    const search = filter.search?.trim();
    if (search && search.length > 200) this.badInput('search must be at most 200 characters', 'filter.search');
    try {
      const result = await this.repository.findPage({
        organizationId,
        ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
        ...(search ? { search } : {}),
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.mapSegment(row)),
        pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, result.total),
      };
    } catch (error) { this.rethrow(error); }
  }

  async get(organizationId: number, segmentId: number): Promise<Segment> {
    this.validateId(segmentId);
    try {
      const result = await this.repository.findById(organizationId, segmentId);
      if (!result) throw itemizeGraphqlError('Segment not found', 'NOT_FOUND');
      return this.mapSegment(result.row, result.history);
    } catch (error) { this.rethrow(error); }
  }

  async create(organizationId: number, userId: number, input: CreateSegmentInput): Promise<Segment> {
    const values = this.normalizeValues(input);
    try {
      return this.mapSegment(await this.repository.create(organizationId, userId, values));
    } catch (error) { this.rethrow(error); }
  }

  async update(
    organizationId: number,
    segmentId: number,
    input: UpdateSegmentInput,
  ): Promise<Segment> {
    this.validateId(segmentId);
    try {
      const outcome = await this.repository.update(
        organizationId,
        segmentId,
        (current) => this.normalizeValues(input, current),
      );
      if (outcome.kind === 'not_found') throw itemizeGraphqlError('Segment not found', 'NOT_FOUND');
      return this.mapSegment(outcome.row);
    } catch (error) { this.rethrow(error); }
  }

  async delete(organizationId: number, segmentId: number): Promise<number> {
    this.validateId(segmentId);
    try {
      const outcome = await this.repository.delete(organizationId, segmentId);
      if (outcome === 'not_found') throw itemizeGraphqlError('Segment not found', 'NOT_FOUND');
      if (outcome === 'in_use') throw itemizeGraphqlError(
        'Segment is used by a campaign', 'CONFLICT', { reason: 'SEGMENT_IN_USE' });
      return segmentId;
    } catch (error) { this.rethrow(error); }
  }

  async recalculate(organizationId: number, segmentId: number): Promise<Segment> {
    this.validateId(segmentId);
    try {
      const outcome = await this.repository.recalculate(organizationId, segmentId);
      if (outcome.kind === 'not_found') throw itemizeGraphqlError('Segment not found', 'NOT_FOUND');
      return this.mapSegment(outcome.row);
    } catch (error) { this.rethrow(error); }
  }

  async preview(organizationId: number, input: PreviewSegmentInput): Promise<SegmentPreview> {
    try {
      const definition = this.definition({
        segmentType: 'dynamic', filterType: input.filterType, filters: input.filters,
      });
      const result = await this.repository.preview(organizationId, definition);
      return {
        count: result.count,
        sample: result.sample.map((row) => ({
          id: Number(row.id), firstName: row.first_name, lastName: row.last_name,
          email: row.email, status: row.status,
        })),
      };
    } catch (error) { this.rethrow(error); }
  }

  async contacts(
    organizationId: number,
    segmentId: number,
    page: PageInput = new PageInput(),
  ): Promise<SegmentContactPage> {
    this.validateId(segmentId);
    const normalized = this.normalizePage(page);
    try {
      const result = await this.repository.contacts({
        organizationId, segmentId, pageSize: normalized.pageSize, offset: normalized.offset,
      });
      if (!result) throw itemizeGraphqlError('Segment not found', 'NOT_FOUND');
      return {
        nodes: result.rows.map((row) => this.mapContact(row)),
        pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
      };
    } catch (error) { this.rethrow(error); }
  }

  async filterOptions(organizationId: number): Promise<SegmentFilterOptions> {
    try {
      const rows = await this.repository.filterOptions(organizationId);
      return {
        fields: FILTER_FIELDS.map((field) => ({ ...field, options: field.options ?? null })),
        tags: rows.tags.map((tag) => ({ ...tag, id: Number(tag.id) })),
        users: rows.users.map((user) => ({ ...user, id: Number(user.id) })),
        pipelines: rows.pipelines.map((pipeline) => ({
          id: Number(pipeline.id), name: pipeline.name,
          stages: this.mapStages(pipeline.stages),
        })),
      };
    } catch (error) { this.rethrow(error); }
  }

  private normalizeValues(
    input: CreateSegmentInput | UpdateSegmentInput,
    existing?: SegmentRow,
  ): SegmentValues {
    const name = input.name === undefined ? existing?.name : input.name;
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 255) {
      this.badInput('name must be between 1 and 255 characters', 'input.name');
    }
    const description = input.description === undefined ? existing?.description ?? null : input.description;
    if (description !== null && (typeof description !== 'string' || description.length > 5000)) {
      this.badInput('description must be null or at most 5000 characters', 'input.description');
    }
    const color = input.color ?? existing?.color ?? '#6366F1';
    if (!/^#[0-9a-f]{6}$/i.test(color)) this.badInput('color must be a six-digit hex color', 'input.color');
    const icon = input.icon ?? existing?.icon ?? 'users';
    if (!/^[a-z0-9_-]{1,50}$/i.test(icon)) this.badInput('icon is invalid', 'input.icon');
    const definition = this.definition(input, existing);
    return {
      name: name!.trim(), description, color, icon,
      isActive: input.isActive ?? existing?.is_active ?? true,
      definition,
    };
  }

  private definition(
    input: Partial<CreateSegmentInput>,
    existing?: SegmentRow,
  ): SegmentDefinition {
    return normalizeSegmentDefinition({
      segment_type: input.segmentType ?? existing?.segment_type,
      filter_type: input.filterType ?? existing?.filter_type,
      filters: input.filters === undefined
        ? existing?.filters
        : input.filters.map((filter) => this.mapFilterInput(filter)),
      static_contact_ids: input.staticContactIds ?? existing?.static_contact_ids,
    });
  }

  private mapFilterInput(filter: SegmentFilterRuleInput): Record<string, unknown> {
    return {
      field: filter.field,
      operator: filter.operator,
      ...(filter.value === undefined ? {} : { value: filter.value }),
      ...(filter.customFieldKey === undefined ? {} : { custom_field_key: filter.customFieldKey }),
    };
  }

  private normalizePage(page: PageInput): { page: number; pageSize: number; offset: number } {
    const pageNumber = Number(page.page ?? 1);
    const pageSize = Number(page.pageSize ?? 50);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) this.badInput('page must be a positive integer', 'page.page');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      this.badInput('pageSize must be between 1 and 100', 'page.pageSize');
    }
    return { page: pageNumber, pageSize, offset: (pageNumber - 1) * pageSize };
  }

  private validateId(id: number): void {
    if (!Number.isSafeInteger(id) || id < 1) this.badInput('Segment ID must be a positive integer', 'id');
  }

  private mapSegment(row: SegmentRow, history: SegmentHistoryRow[] = []): Segment {
    return {
      id: Number(row.id), organizationId: Number(row.organization_id), name: row.name,
      description: row.description, color: row.color, icon: row.icon,
      filterType: row.filter_type, filters: Array.isArray(row.filters) ? row.filters : [],
      segmentType: row.segment_type, staticContactIds: row.static_contact_ids ?? [],
      contactCount: Number(row.contact_count), lastCalculatedAt: row.last_calculated_at,
      isActive: row.is_active, usedInCampaigns: Number(row.used_in_campaigns ?? 0),
      usedInAutomations: Number(row.used_in_automations ?? 0),
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
      history: history.map((item) => this.mapHistory(item)),
    };
  }

  private mapHistory(row: SegmentHistoryRow): SegmentHistory {
    return {
      id: Number(row.id), segmentId: Number(row.segment_id), organizationId: Number(row.organization_id),
      contactCount: Number(row.contact_count), calculatedAt: row.calculated_at,
      contactsAdded: Number(row.contacts_added), contactsRemoved: Number(row.contacts_removed),
      createdAt: row.created_at,
    };
  }

  private mapContact(row: SegmentContactRow): SegmentContact {
    return {
      id: Number(row.id), firstName: row.first_name, lastName: row.last_name,
      email: row.email, phone: row.phone, status: row.status, source: row.source,
      assignedTo: row.assigned_to === null ? null : Number(row.assigned_to),
      customFields: row.custom_fields ?? {}, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapStages(value: unknown): Array<{ id: string; name: string; color: string; order: number | null }> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((stage, index) => {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return [];
      const row = stage as Record<string, unknown>;
      const id = String(row.id ?? row.stage_key ?? '');
      const name = String(row.name ?? '');
      if (!id || !name) return [];
      return [{ id, name, color: String(row.color ?? '#6366F1'),
        order: typeof row.order === 'number' ? row.order : index }];
    });
  }

  private badInput(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof AudienceValidationError) {
      throw itemizeGraphqlError(error.message, 'BAD_USER_INPUT', { field: error.field });
    }
    throw error;
  }
}
