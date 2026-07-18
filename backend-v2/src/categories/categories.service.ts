import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { CreateCategoryInput, UpdateCategoryInput } from './category.inputs';
import { Category } from './category.types';
import {
  CategoriesRepository,
  CategoryRow,
} from './categories.repository';

const DEFAULT_CATEGORY_COLOR = '#3B82F6';
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  async list(userId: number): Promise<Category[]> {
    try {
      return (await this.categories.findAll(userId)).map(this.mapCategory);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async create(userId: number, input: CreateCategoryInput): Promise<Category> {
    const name = this.name(input.name);
    const colorValue = this.color(input.colorValue ?? DEFAULT_CATEGORY_COLOR);
    try {
      return this.mapCategory(
        await this.categories.create(userId, { name, colorValue }),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(
    userId: number,
    categoryId: number,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    this.id(categoryId);
    if (input.name === null || input.colorValue === null) {
      throw itemizeGraphqlError(
        'Category fields cannot be null',
        'BAD_USER_INPUT',
        { reason: 'NULL_CATEGORY_FIELD' },
      );
    }
    const values = {
      ...(input.name !== undefined ? { name: this.name(input.name) } : {}),
      ...(input.colorValue !== undefined
        ? { colorValue: this.color(input.colorValue) }
        : {}),
    };
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError(
        'Category update must include a name or color',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_CATEGORY_UPDATE' },
      );
    }

    try {
      const outcome = await this.categories.update(userId, categoryId, values);
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Category not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'protected_general') {
        throw itemizeGraphqlError(
          'The General category cannot be renamed',
          'BAD_USER_INPUT',
          { field: 'name', reason: 'GENERAL_CATEGORY_REQUIRED' },
        );
      }
      return this.mapCategory(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(userId: number, categoryId: number): Promise<number> {
    this.id(categoryId);
    try {
      const outcome = await this.categories.delete(userId, categoryId);
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Category not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'protected_general') {
        throw itemizeGraphqlError(
          'The General category cannot be deleted',
          'BAD_USER_INPUT',
          { reason: 'GENERAL_CATEGORY_REQUIRED' },
        );
      }
      if (outcome.kind === 'general_missing') {
        throw itemizeGraphqlError(
          'The General category is unavailable',
          'SERVICE_UNAVAILABLE',
          { reason: 'GENERAL_CATEGORY_MISSING' },
        );
      }
      return categoryId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Category ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_CATEGORY_ID' },
      );
    }
  }

  private name(value: string): string {
    const name = value?.trim();
    if (!name || name.length > 50) {
      throw itemizeGraphqlError(
        'Category name must contain between 1 and 50 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_CATEGORY_NAME' },
      );
    }
    return name;
  }

  private color(value: string): string {
    const color = value?.trim();
    if (!COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        'Category color must be a three- or six-digit hex color',
        'BAD_USER_INPUT',
        { field: 'colorValue', reason: 'INVALID_CATEGORY_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private readonly mapCategory = (row: CategoryRow): Category => ({
    id: Number(row.id),
    name: row.name,
    colorValue: row.color_value ?? DEFAULT_CATEGORY_COLOR,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if ((error as { code?: string })?.code === '23505') {
      throw itemizeGraphqlError(
        'Category name already exists',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'DUPLICATE_CATEGORY_NAME' },
      );
    }
    throw error;
  }
}
