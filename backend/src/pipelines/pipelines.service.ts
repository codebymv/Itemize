import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CreatePipelineInput,
  PipelineStageInput,
  UpdatePipelineInput,
} from './pipeline.inputs';
import { Pipeline, PipelineDeal } from './pipeline.types';
import {
  CreatePipelineValues,
  PipelineDealRow,
  PipelineRow,
  PipelineStageValue,
  PipelinesRepository,
  UpdatePipelineValues,
} from './pipelines.repository';

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_STAGE_COLOR = '#6B7280';

@Injectable()
export class PipelinesService {
  constructor(private readonly pipelines: PipelinesRepository) {}

  async list(organizationId: number): Promise<Pipeline[]> {
    try {
      return (await this.pipelines.findAll(organizationId)).map((row) =>
        this.mapPipeline(row, []),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async get(organizationId: number, pipelineId: number): Promise<Pipeline> {
    this.id(pipelineId);
    try {
      const result = await this.pipelines.findById(organizationId, pipelineId);
      if (!result) {
        throw itemizeGraphqlError('Pipeline not found', 'NOT_FOUND');
      }
      return this.mapPipeline(result.pipeline, result.deals);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreatePipelineInput,
  ): Promise<Pipeline> {
    const values: CreatePipelineValues = {
      name: this.name(input.name),
      description: this.description(input.description),
      stages: input.stages
        ? this.stages(input.stages)
        : this.defaultStages(),
      isDefault: input.isDefault ?? false,
    };
    try {
      return this.mapPipeline(
        await this.pipelines.create(organizationId, userId, values),
        [],
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(
    organizationId: number,
    pipelineId: number,
    input: UpdatePipelineInput,
  ): Promise<Pipeline> {
    this.id(pipelineId);
    if (input.name === null || input.stages === null || input.isDefault === null) {
      throw itemizeGraphqlError(
        'Pipeline name, stages, and default status cannot be null',
        'BAD_USER_INPUT',
        { reason: 'NULL_PIPELINE_FIELD' },
      );
    }
    const values: UpdatePipelineValues = {
      ...(input.name !== undefined ? { name: this.name(input.name) } : {}),
      ...(input.description !== undefined
        ? { description: this.description(input.description) }
        : {}),
      ...(input.stages !== undefined ? { stages: this.stages(input.stages) } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    };
    try {
      const outcome = await this.pipelines.update(
        organizationId,
        pipelineId,
        values,
      );
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Pipeline not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'stage_in_use') {
        throw itemizeGraphqlError(
          'Cannot remove a stage that is still used by a deal',
          'BAD_USER_INPUT',
          { field: 'stages', reason: 'STAGE_IN_USE' },
        );
      }
      return this.mapPipeline(outcome.row, []);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(organizationId: number, pipelineId: number): Promise<number> {
    this.id(pipelineId);
    try {
      const outcome = await this.pipelines.delete(organizationId, pipelineId);
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Pipeline not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'has_deals') {
        throw itemizeGraphqlError(
          'Cannot delete a pipeline with existing deals',
          'BAD_USER_INPUT',
          { reason: 'PIPELINE_HAS_DEALS' },
        );
      }
      return pipelineId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Pipeline ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_PIPELINE_ID' },
      );
    }
  }

  private name(value: string): string {
    const name = value?.trim();
    if (!name || name.length > 255) {
      throw itemizeGraphqlError(
        'Pipeline name must contain between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_PIPELINE_NAME' },
      );
    }
    return name;
  }

  private description(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const description = value.trim();
    if (description.length > 5000) {
      throw itemizeGraphqlError(
        'Pipeline description must not exceed 5000 characters',
        'BAD_USER_INPUT',
        { field: 'description', reason: 'INVALID_PIPELINE_DESCRIPTION' },
      );
    }
    return description || null;
  }

  private stages(values: PipelineStageInput[]): PipelineStageValue[] {
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
      throw itemizeGraphqlError(
        'A pipeline must contain between 1 and 100 stages',
        'BAD_USER_INPUT',
        { field: 'stages', reason: 'INVALID_PIPELINE_STAGES' },
      );
    }
    const stageIds = new Set<string>();
    return values.map((value, order) => {
      const id = value.id?.trim();
      const name = value.name?.trim();
      const color = (value.color ?? DEFAULT_STAGE_COLOR).trim().toUpperCase();
      if (!id || id.length > 100 || stageIds.has(id)) {
        throw itemizeGraphqlError(
          'Stage IDs must be unique non-blank strings no longer than 100 characters',
          'BAD_USER_INPUT',
          { field: 'stages', reason: 'INVALID_STAGE_ID' },
        );
      }
      if (!name || name.length > 255) {
        throw itemizeGraphqlError(
          'Every stage needs a name no longer than 255 characters',
          'BAD_USER_INPUT',
          { field: 'stages', reason: 'INVALID_STAGE_NAME' },
        );
      }
      if (!COLOR_PATTERN.test(color)) {
        throw itemizeGraphqlError(
          'Every stage color must be a six-digit hex color',
          'BAD_USER_INPUT',
          { field: 'stages', reason: 'INVALID_STAGE_COLOR' },
        );
      }
      stageIds.add(id);
      return { id, name, color, order };
    });
  }

  private defaultStages(): PipelineStageValue[] {
    return [
      ['Lead', '#6B7280'],
      ['Qualified', '#3B82F6'],
      ['Proposal', '#8B5CF6'],
      ['Negotiation', '#F59E0B'],
      ['Closed Won', '#10B981'],
      ['Closed Lost', '#EF4444'],
    ].map(([name, color], order) => ({
      id: randomUUID(),
      name,
      color,
      order,
    }));
  }

  private mapPipeline(row: PipelineRow, deals: PipelineDealRow[]): Pipeline {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      name: row.name,
      description: row.description,
      stages: (row.stages ?? []).map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        order: Number(stage.order ?? index),
      })),
      isDefault: row.is_default,
      createdById: row.created_by === null ? null : Number(row.created_by),
      dealCount: Number(row.deal_count),
      totalValue: Number(row.total_value),
      deals: deals.map(this.mapDeal),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private readonly mapDeal = (row: PipelineDealRow): PipelineDeal => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    pipelineId: Number(row.pipeline_id),
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    stageId: row.stage_id,
    title: row.title,
    value: row.value,
    currency: row.currency,
    probability: Number(row.probability),
    expectedCloseDate:
      row.expected_close_date instanceof Date
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw error;
  }
}
