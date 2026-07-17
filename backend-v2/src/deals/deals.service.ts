import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateDealInput,
  DealFilterInput,
  DealSortInput,
  UpdateDealInput,
} from './deal.inputs';
import { DealSortDirection, DealSortField } from './deal.enums';
import { Deal, DealPage } from './deal.types';
import {
  DealRow,
  DealsRepository,
  DealUpdates,
  DealValues,
  DealWriteOutcome,
} from './deals.repository';

const CURRENCIES = new Set([
  'AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'INR',
  'JPY', 'MXN', 'NZD', 'SEK', 'SGD', 'USD',
]);
const DECIMAL = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DealsService {
  constructor(private readonly deals: DealsRepository) {}

  async list(
    organizationId: number,
    filter: DealFilterInput = {},
    sort: DealSortInput = new DealSortInput(),
    page: PageInput = new PageInput(),
  ): Promise<DealPage> {
    const normalized = this.page(page);
    if (filter.pipelineId !== undefined) this.id(filter.pipelineId, 'pipelineId');
    if (filter.contactId !== undefined) this.id(filter.contactId, 'contactId');
    if (filter.assignedToId !== undefined) this.id(filter.assignedToId, 'assignedToId');
    const stageId =
      filter.stageId === undefined ? undefined : this.stage(filter.stageId);
    const result = await this.deals.findPage({
      organizationId,
      ...filter,
      stageId,
      sortField: sort.field ?? DealSortField.CREATED_AT,
      sortDirection: sort.direction ?? DealSortDirection.DESC,
      pageSize: normalized.pageSize,
      offset: normalized.offset,
    });
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  async get(organizationId: number, dealId: number): Promise<Deal> {
    this.id(dealId, 'id');
    const row = await this.deals.findById(organizationId, dealId);
    if (!row) throw itemizeGraphqlError('Deal not found', 'NOT_FOUND');
    return this.map(row);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateDealInput,
  ): Promise<Deal> {
    this.id(input.pipelineId, 'pipelineId');
    const values: DealValues = {
      pipelineId: input.pipelineId,
      contactId: this.nullableId(input.contactId, 'contactId'),
      ...(input.stageId === undefined ? {} : { stageId: this.stage(input.stageId) }),
      title: this.title(input.title),
      value: this.value(input.value ?? '0'),
      currency: this.currency(input.currency ?? 'USD'),
      probability: this.probability(input.probability ?? 0),
      expectedCloseDate: this.date(input.expectedCloseDate),
      assignedToId: this.nullableId(input.assignedToId, 'assignedToId'),
      customFields: this.json(input.customFields),
      tags: this.tags(input.tags),
    };
    return this.outcome(await this.deals.create(organizationId, userId, values));
  }

  async update(
    organizationId: number,
    userId: number,
    dealId: number,
    input: UpdateDealInput,
  ): Promise<Deal> {
    this.id(dealId, 'id');
    for (const field of ['pipelineId', 'stageId', 'title', 'value', 'currency', 'probability'] as const) {
      if (input[field] === null) {
        throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
          field,
          reason: 'NULL_DEAL_FIELD',
        });
      }
    }
    const updates: DealUpdates = {
      ...(input.pipelineId !== undefined
        ? { pipelineId: this.requiredId(input.pipelineId, 'pipelineId') }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'contactId')
        ? { contactId: this.nullableId(input.contactId, 'contactId') }
        : {}),
      ...(input.stageId !== undefined
        ? { stageId: this.stage(input.stageId as string) }
        : {}),
      ...(input.title !== undefined
        ? { title: this.title(input.title as string) }
        : {}),
      ...(input.value !== undefined
        ? { value: this.value(input.value as string) }
        : {}),
      ...(input.currency !== undefined
        ? { currency: this.currency(input.currency as string) }
        : {}),
      ...(input.probability !== undefined
        ? { probability: this.probability(input.probability as number) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'expectedCloseDate')
        ? { expectedCloseDate: this.date(input.expectedCloseDate) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'assignedToId')
        ? { assignedToId: this.nullableId(input.assignedToId, 'assignedToId') }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'customFields')
        ? { customFields: this.json(input.customFields) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'tags')
        ? { tags: this.tags(input.tags) }
        : {}),
    };
    return this.outcome(await this.deals.update(organizationId, userId, dealId, updates));
  }

  async move(
    organizationId: number,
    userId: number,
    dealId: number,
    stageId: string,
  ): Promise<Deal> {
    this.id(dealId, 'id');
    return this.outcome(
      await this.deals.move(organizationId, userId, dealId, this.stage(stageId)),
    );
  }

  async lifecycle(
    organizationId: number,
    userId: number,
    dealId: number,
    target: 'won' | 'lost' | 'open',
    reason?: string | null,
  ): Promise<Deal> {
    this.id(dealId, 'id');
    const normalizedReason =
      target === 'lost' ? this.reason(reason) : null;
    return this.outcome(
      await this.deals.lifecycle(
        organizationId,
        userId,
        dealId,
        target,
        normalizedReason,
      ),
    );
  }

  async delete(organizationId: number, dealId: number): Promise<number> {
    this.id(dealId, 'id');
    if (!(await this.deals.delete(organizationId, dealId))) {
      throw itemizeGraphqlError('Deal not found', 'NOT_FOUND');
    }
    return dealId;
  }

  private outcome(outcome: DealWriteOutcome): Deal {
    if (outcome.kind === 'ok') return this.map(outcome.row);
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Deal not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'pipeline_not_found') {
      throw itemizeGraphqlError('Pipeline not found', 'BAD_USER_INPUT', {
        field: 'pipelineId',
        reason: 'INVALID_DEAL_PIPELINE',
      });
    }
    const field = outcome.kind === 'invalid_stage'
      ? 'stageId'
      : outcome.kind === 'invalid_contact'
        ? 'contactId'
        : 'assignedToId';
    throw itemizeGraphqlError(`Invalid deal ${field}`, 'BAD_USER_INPUT', {
      field,
      reason: outcome.kind.toUpperCase(),
    });
  }

  private map(row: DealRow): Deal {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      pipelineId: Number(row.pipeline_id),
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      stageId: row.stage_id,
      title: row.title,
      value: row.value,
      currency: row.currency,
      probability: Number(row.probability),
      expectedCloseDate: row.expected_close_date instanceof Date
        ? row.expected_close_date.toISOString().slice(0, 10)
        : row.expected_close_date,
      assignedToId: row.assigned_to === null ? null : Number(row.assigned_to),
      assignedToName: row.assigned_to_name,
      createdById: row.created_by === null ? null : Number(row.created_by),
      wonAt: row.won_at ? new Date(row.won_at) : null,
      lostAt: row.lost_at ? new Date(row.lost_at) : null,
      lostReason: row.lost_reason,
      customFields: row.custom_fields ?? {},
      tags: row.tags ?? [],
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      contactCompany: row.contact_company,
      pipelineName: row.pipeline_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private id(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_ID',
      });
    }
  }

  private requiredId(value: number | null, field: string): number {
    this.id(value as number, field);
    return value as number;
  }

  private nullableId(
    value: number | null | undefined,
    field: string,
  ): number | null {
    if (value === null || value === undefined) return null;
    this.id(value, field);
    return value;
  }

  private title(value: string): string {
    const title = value?.trim();
    if (!title || title.length > 255) {
      throw itemizeGraphqlError(
        'Deal title must contain between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'title', reason: 'INVALID_DEAL_TITLE' },
      );
    }
    return title;
  }

  private stage(value: string): string {
    const stage = value?.trim();
    if (!stage || stage.length > 100) {
      throw itemizeGraphqlError('Stage ID is invalid', 'BAD_USER_INPUT', {
        field: 'stageId',
        reason: 'INVALID_STAGE_ID',
      });
    }
    return stage;
  }

  private value(value: string): string {
    const normalized = String(value).trim();
    if (!DECIMAL.test(normalized) || Number(normalized) > 9999999999999.99) {
      throw itemizeGraphqlError(
        'Deal value must be a non-negative decimal with at most two fraction digits',
        'BAD_USER_INPUT',
        { field: 'value', reason: 'INVALID_DEAL_VALUE' },
      );
    }
    return normalized;
  }

  private currency(value: string): string {
    const currency = value?.trim().toUpperCase();
    if (!CURRENCIES.has(currency)) {
      throw itemizeGraphqlError('Currency is not supported', 'BAD_USER_INPUT', {
        field: 'currency',
        reason: 'UNSUPPORTED_CURRENCY',
      });
    }
    return currency;
  }

  private probability(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw itemizeGraphqlError(
        'Probability must be an integer from 0 through 100',
        'BAD_USER_INPUT',
        { field: 'probability', reason: 'INVALID_PROBABILITY' },
      );
    }
    return value;
  }

  private date(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value.trim() === '') return null;
    const normalized = value.trim();
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (!DATE.test(normalized) || Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== normalized) {
      throw itemizeGraphqlError('Expected close date is invalid', 'BAD_USER_INPUT', {
        field: 'expectedCloseDate',
        reason: 'INVALID_DATE',
      });
    }
    return normalized;
  }

  private json(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (Array.isArray(value) || typeof value !== 'object' ||
        Buffer.byteLength(JSON.stringify(value), 'utf8') > 65536) {
      throw itemizeGraphqlError('Custom fields are invalid or too large', 'BAD_USER_INPUT', {
        field: 'customFields',
        reason: 'INVALID_CUSTOM_FIELDS',
      });
    }
    return value;
  }

  private tags(value: string[] | null | undefined): string[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100) {
      throw itemizeGraphqlError('Tags are invalid', 'BAD_USER_INPUT', {
        field: 'tags',
        reason: 'INVALID_TAGS',
      });
    }
    const tags = [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
    if (tags.some((tag) => tag.length > 100)) {
      throw itemizeGraphqlError('Tags are invalid', 'BAD_USER_INPUT', {
        field: 'tags',
        reason: 'INVALID_TAGS',
      });
    }
    return tags;
  }

  private reason(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const reason = value.trim();
    if (reason.length > 5000) {
      throw itemizeGraphqlError('Lost reason is too long', 'BAD_USER_INPUT', {
        field: 'reason',
        reason: 'INVALID_LOST_REASON',
      });
    }
    return reason || null;
  }

  private page(input: PageInput): { page: number; pageSize: number; offset: number } {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw itemizeGraphqlError('Page input is invalid', 'BAD_USER_INPUT', {
        field: 'page',
        reason: 'INVALID_PAGE',
      });
    }
    return { page, pageSize, offset: (page - 1) * pageSize };
  }

}
