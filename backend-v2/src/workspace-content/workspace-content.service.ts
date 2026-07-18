import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { NormalizedPage, PageInput, pageInfo } from '../common/pagination';
import { WorkspaceContentFilterInput } from './workspace-content.inputs';
import {
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceListPage,
  WorkspaceNote,
  WorkspaceNotePage,
} from './workspace-content.types';
import {
  CreateWorkspaceNoteValues,
  WorkspaceContentRepository,
  WorkspaceListRow,
  UpdateWorkspaceNoteValues,
  WorkspaceNoteRow,
} from './workspace-content.repository';
import {
  CreateWorkspaceNoteInput,
  UpdateWorkspaceNoteInput,
} from './workspace-note.inputs';

const DEFAULT_NOTE_COLOR = '#3B82F6';
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MUTATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class WorkspaceContentService {
  constructor(private readonly content: WorkspaceContentRepository) {}

  async lists(
    userId: number,
    filter: WorkspaceContentFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<WorkspaceListPage> {
    const normalizedPage = this.normalizePage(page);
    const normalizedFilter = this.normalizeFilter(filter);
    try {
      const result = await this.content.findLists({
        userId,
        ...normalizedFilter,
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.mapList(row)),
        pageInfo: pageInfo(
          normalizedPage.page,
          normalizedPage.pageSize,
          result.total,
        ),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async notes(
    userId: number,
    filter: WorkspaceContentFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<WorkspaceNotePage> {
    const normalizedPage = this.normalizePage(page);
    const normalizedFilter = this.normalizeFilter(filter);
    try {
      const result = await this.content.findNotes({
        userId,
        ...normalizedFilter,
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.mapNote(row)),
        pageInfo: pageInfo(
          normalizedPage.page,
          normalizedPage.pageSize,
          result.total,
        ),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createNote(
    userId: number,
    input: CreateWorkspaceNoteInput,
  ): Promise<WorkspaceNote> {
    const values: CreateWorkspaceNoteValues = {
      title: input.title === undefined
        ? 'Untitled Note'
        : this.title(input.title),
      content: input.content === undefined
        ? ''
        : this.noteContent(input.content),
      category: input.category === undefined
        ? 'General'
        : this.category(input.category),
      colorValue: input.colorValue === undefined
        ? DEFAULT_NOTE_COLOR
        : this.color(input.colorValue),
      positionX: input.positionX === undefined
        ? 2000
        : this.nonNegativeNumber(input.positionX, 'positionX'),
      positionY: input.positionY === undefined
        ? 2000
        : this.nonNegativeNumber(input.positionY, 'positionY'),
      width: input.width === undefined
        ? null
        : this.positiveInteger(input.width, 'width'),
      height: input.height === undefined
        ? null
        : this.positiveInteger(input.height, 'height'),
      zIndex: input.zIndex === undefined
        ? 0
        : this.integer(input.zIndex, 'zIndex'),
    };
    try {
      const outcome = await this.content.createNote(userId, values);
      if (outcome.kind === 'category_not_found') {
        throw this.categoryNotFound();
      }
      if (outcome.kind !== 'completed') {
        throw itemizeGraphqlError(
          'Workspace note could not be created',
          'SERVICE_UNAVAILABLE',
        );
      }
      return this.mapNote(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateNote(
    userId: number,
    noteId: number,
    input: UpdateWorkspaceNoteInput,
  ): Promise<WorkspaceNote> {
    this.id(noteId);
    const mutationId = this.mutationId(input.mutationId);
    const values: Partial<CreateWorkspaceNoteValues> = {};
    if (input.title !== undefined) values.title = this.title(input.title);
    if (input.content !== undefined) {
      values.content = this.noteContent(input.content);
    }
    if (input.category !== undefined) {
      values.category = this.category(input.category);
    }
    if (input.colorValue !== undefined) {
      values.colorValue = this.color(input.colorValue);
    }
    if (input.positionX !== undefined) {
      values.positionX = this.nonNegativeNumber(
        input.positionX,
        'positionX',
      );
    }
    if (input.positionY !== undefined) {
      values.positionY = this.nonNegativeNumber(
        input.positionY,
        'positionY',
      );
    }
    if (input.width !== undefined) {
      values.width = this.positiveInteger(input.width, 'width');
    }
    if (input.height !== undefined) {
      values.height = this.positiveInteger(input.height, 'height');
    }
    if (input.zIndex !== undefined) {
      values.zIndex = this.integer(input.zIndex, 'zIndex');
    }
    const keys = Object.keys(values);
    if (keys.length === 0) {
      throw itemizeGraphqlError(
        'Workspace note update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_NOTE_UPDATE' },
      );
    }
    const eventType =
      keys.length === 1 && keys[0] === 'content'
        ? 'CONTENT_CHANGED'
        : keys.length === 1 && keys[0] === 'title'
          ? 'TITLE_CHANGED'
          : keys.length === 1 && keys[0] === 'category'
            ? 'CATEGORY_CHANGED'
            : 'noteUpdated';
    const update: UpdateWorkspaceNoteValues = {
      ...values,
      mutationId,
      eventType,
    };

    try {
      const outcome = await this.content.updateNote(userId, noteId, update);
      if (outcome.kind === 'not_found') throw this.noteNotFound();
      if (outcome.kind === 'category_not_found') {
        throw this.categoryNotFound();
      }
      return this.mapNote(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteNote(
    userId: number,
    noteId: number,
    mutationId: string,
  ): Promise<number> {
    this.id(noteId);
    const normalizedMutationId = this.mutationId(mutationId);
    try {
      const outcome = await this.content.deleteNote(
        userId,
        noteId,
        normalizedMutationId,
      );
      if (outcome.kind === 'not_found') throw this.noteNotFound();
      return outcome.deletedId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private normalizePage(page: PageInput): NormalizedPage {
    const pageNumber = page.page ?? 1;
    const pageSize = page.pageSize ?? 50;
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      throw itemizeGraphqlError('page must be at least 1', 'BAD_USER_INPUT', {
        field: 'page',
      });
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw itemizeGraphqlError(
        'pageSize must be between 1 and 100',
        'BAD_USER_INPUT',
        { field: 'pageSize' },
      );
    }
    return {
      page: pageNumber,
      pageSize,
      offset: (pageNumber - 1) * pageSize,
    };
  }

  private normalizeFilter(
    filter: WorkspaceContentFilterInput,
  ): WorkspaceContentFilterInput {
    const search = filter.search?.trim();
    if (search && search.length > 200) {
      throw itemizeGraphqlError(
        'search must not exceed 200 characters',
        'BAD_USER_INPUT',
        { field: 'search' },
      );
    }
    if (
      filter.categoryId !== undefined &&
      (!Number.isSafeInteger(filter.categoryId) || filter.categoryId < 1)
    ) {
      throw itemizeGraphqlError(
        'categoryId must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'categoryId' },
      );
    }
    return {
      ...(search ? { search } : {}),
      ...(filter.categoryId !== undefined
        ? { categoryId: filter.categoryId }
        : {}),
    };
  }

  private mapList(row: WorkspaceListRow): WorkspaceList {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      title: row.title,
      category: row.category ?? 'General',
      categoryId: row.category_id === null ? null : Number(row.category_id),
      items: this.mapItems(row.items),
      colorValue: row.color_value,
      positionX: Number(row.position_x ?? 0),
      positionY: Number(row.position_y ?? 0),
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      zIndex: Number(row.z_index ?? 0),
      shareToken: row.share_token,
      isPublic: Boolean(row.is_public),
      sharedAt: row.shared_at ? new Date(row.shared_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapNote(row: WorkspaceNoteRow): WorkspaceNote {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      title: row.title ?? 'Untitled Note',
      content: row.content ?? '',
      category: row.category ?? 'General',
      categoryId: row.category_id === null ? null : Number(row.category_id),
      colorValue: row.color_value,
      positionX: Number(row.position_x ?? 0),
      positionY: Number(row.position_y ?? 0),
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      zIndex: Number(row.z_index ?? 0),
      shareToken: row.share_token,
      isPublic: Boolean(row.is_public),
      sharedAt: row.shared_at ? new Date(row.shared_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Workspace note ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_NOTE_ID' },
      );
    }
  }

  private mutationId(value: string): string {
    const mutationId = value?.trim();
    if (!MUTATION_ID_PATTERN.test(mutationId)) {
      throw itemizeGraphqlError(
        'mutationId must be a UUID',
        'BAD_USER_INPUT',
        { field: 'mutationId', reason: 'INVALID_MUTATION_ID' },
      );
    }
    return mutationId.toLowerCase();
  }

  private title(value: string | null): string {
    const title = value?.trim();
    if (!title || title.length > 200) {
      throw itemizeGraphqlError(
        'Note title must contain between 1 and 200 characters',
        'BAD_USER_INPUT',
        { field: 'title', reason: 'INVALID_NOTE_TITLE' },
      );
    }
    return title;
  }

  private noteContent(value: string | null): string {
    if (typeof value !== 'string' || value.length > 50_000) {
      throw itemizeGraphqlError(
        'Note content must not exceed 50000 characters',
        'BAD_USER_INPUT',
        { field: 'content', reason: 'INVALID_NOTE_CONTENT' },
      );
    }
    return value;
  }

  private category(value: string | null): string {
    const category = value?.trim();
    if (!category || category.length > 50) {
      throw itemizeGraphqlError(
        'Note category must contain between 1 and 50 characters',
        'BAD_USER_INPUT',
        { field: 'category', reason: 'INVALID_NOTE_CATEGORY' },
      );
    }
    return category;
  }

  private color(value: string | null): string {
    const color = value?.trim();
    if (!color || !COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        'Note color must be a six-digit hex color',
        'BAD_USER_INPUT',
        { field: 'colorValue', reason: 'INVALID_NOTE_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private nonNegativeNumber(value: number | null, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw itemizeGraphqlError(
        `${field} must be at least 0`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_NOTE_GEOMETRY' },
      );
    }
    return value;
  }

  private positiveInteger(value: number | null, field: string): number {
    const integer = this.integer(value, field);
    if (integer < 1) {
      throw itemizeGraphqlError(
        `${field} must be positive`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_NOTE_GEOMETRY' },
      );
    }
    return integer;
  }

  private integer(value: number | null, field: string): number {
    if (!Number.isSafeInteger(value)) {
      throw itemizeGraphqlError(
        `${field} must be an integer`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_NOTE_GEOMETRY' },
      );
    }
    return value as number;
  }

  private noteNotFound(): GraphQLError {
    return itemizeGraphqlError('Workspace note not found', 'NOT_FOUND');
  }

  private categoryNotFound(): GraphQLError {
    return itemizeGraphqlError(
      'Note category was not found',
      'BAD_USER_INPUT',
      { field: 'category', reason: 'NOTE_CATEGORY_NOT_FOUND' },
    );
  }

  private mapItems(value: unknown): WorkspaceListItem[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as { id?: unknown }).id !== 'string' ||
        typeof (item as { text?: unknown }).text !== 'string'
      ) {
        return [];
      }
      return [{
        id: (item as { id: string }).id,
        text: (item as { text: string }).text,
        completed: Boolean((item as { completed?: unknown }).completed),
      }];
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(
      'Workspace content service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
