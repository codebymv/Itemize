import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { CreateTagInput, UpdateTagInput } from './tag.inputs';
import { Tag } from './tag.types';
import { TagRow, TagsRepository } from './tags.repository';

const DEFAULT_TAG_COLOR = '#3B82F6';
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

@Injectable()
export class TagsService {
  constructor(private readonly tags: TagsRepository) {}

  async list(organizationId: number): Promise<Tag[]> {
    try {
      return (await this.tags.findAll(organizationId)).map(this.mapTag);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async suggestions(organizationId: number): Promise<string[]> {
    try {
      return await this.tags.suggestions(organizationId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async create(organizationId: number, input: CreateTagInput): Promise<Tag> {
    const name = this.name(input.name);
    const color = this.color(input.color ?? DEFAULT_TAG_COLOR);
    try {
      return this.mapTag(await this.tags.create(organizationId, { name, color }));
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(
    organizationId: number,
    tagId: number,
    input: UpdateTagInput,
  ): Promise<Tag> {
    this.id(tagId);
    if (input.name === null || input.color === null) {
      throw itemizeGraphqlError(
        'Tag name and color cannot be null',
        'BAD_USER_INPUT',
        { reason: 'NULL_TAG_FIELD' },
      );
    }
    const values = {
      ...(input.name !== undefined ? { name: this.name(input.name) } : {}),
      ...(input.color !== undefined ? { color: this.color(input.color) } : {}),
    };
    try {
      const outcome = await this.tags.update(organizationId, tagId, values);
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Tag not found', 'NOT_FOUND');
      }
      return this.mapTag(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(organizationId: number, tagId: number): Promise<number> {
    this.id(tagId);
    try {
      if (!(await this.tags.delete(organizationId, tagId))) {
        throw itemizeGraphqlError('Tag not found', 'NOT_FOUND');
      }
      return tagId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Tag ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_TAG_ID' },
      );
    }
  }

  private name(value: string): string {
    const name = value?.trim();
    if (!name || name.length > 100) {
      throw itemizeGraphqlError(
        'Tag name must contain between 1 and 100 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_TAG_NAME' },
      );
    }
    return name;
  }

  private color(value: string): string {
    const color = value?.trim();
    if (!COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        'Tag color must be a six-digit hex color',
        'BAD_USER_INPUT',
        { field: 'color', reason: 'INVALID_TAG_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private readonly mapTag = (row: TagRow): Tag => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    name: row.name,
    color: row.color ?? DEFAULT_TAG_COLOR,
    contactCount: Number(row.contact_count),
    dealCount: Number(row.deal_count),
    createdAt: new Date(row.created_at),
  });

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if ((error as { code?: string })?.code === '23505') {
      throw itemizeGraphqlError(
        'Tag with this name already exists',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'DUPLICATE_TAG_NAME' },
      );
    }
    throw error;
  }
}
