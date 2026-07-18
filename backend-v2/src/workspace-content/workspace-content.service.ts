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
  WorkspaceWhiteboard,
  WorkspaceWhiteboardPage,
} from './workspace-content.types';
import {
  CreateWorkspaceListValues,
  CreateWorkspaceNoteValues,
  CreateWorkspaceWhiteboardValues,
  UpdateWorkspaceListValues,
  UpdateWorkspaceWhiteboardValues,
  WorkspaceContentRepository,
  WorkspaceListRow,
  UpdateWorkspaceNoteValues,
  WorkspaceNoteRow,
  WorkspaceWhiteboardRow,
} from './workspace-content.repository';
import {
  CreateWorkspaceListInput,
  UpdateWorkspaceListInput,
  WorkspaceListItemInput,
} from './workspace-list.inputs';
import {
  CreateWorkspaceNoteInput,
  UpdateWorkspaceNoteInput,
} from './workspace-note.inputs';
import {
  CreateWorkspaceWhiteboardInput,
  UpdateWorkspaceWhiteboardInput,
} from './workspace-whiteboard.inputs';

const DEFAULT_NOTE_COLOR = '#3B82F6';
const DEFAULT_LIST_WIDTH = 340;
const DEFAULT_LIST_HEIGHT = 265;
const MAX_LIST_ITEMS = 100;
const MAX_LIST_ITEM_TEXT_LENGTH = 500;
const MAX_LIST_ITEMS_JSON_BYTES = 40_000;
const MAX_WHITEBOARD_JSON_BYTES = 1_048_576;
const MAX_WHITEBOARD_DIMENSION = 10_000;
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

  async whiteboards(
    userId: number,
    filter: WorkspaceContentFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<WorkspaceWhiteboardPage> {
    const normalizedPage = this.normalizePage(page);
    const normalizedFilter = this.normalizeFilter(filter);
    try {
      const result = await this.content.findWhiteboards({
        userId,
        ...normalizedFilter,
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.mapWhiteboard(row)),
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

  async createList(
    userId: number,
    input: CreateWorkspaceListInput,
  ): Promise<WorkspaceList> {
    const values: CreateWorkspaceListValues = {
      title: this.listTitle(input.title),
      category: input.category === undefined
        ? 'General'
        : this.listCategory(input.category),
      items: input.items === undefined || input.items === null
        ? []
        : this.listItems(input.items),
      colorValue: input.colorValue === undefined
        ? null
        : this.listColor(input.colorValue),
      positionX: input.positionX === undefined
        ? 0
        : this.listCoordinate(input.positionX, 'positionX'),
      positionY: input.positionY === undefined
        ? 0
        : this.listCoordinate(input.positionY, 'positionY'),
      width: input.width === undefined
        ? DEFAULT_LIST_WIDTH
        : this.listDimension(input.width, 'width'),
      height: input.height === undefined
        ? DEFAULT_LIST_HEIGHT
        : this.listDimension(input.height, 'height'),
    };
    try {
      const outcome = await this.content.createList(userId, values);
      if (outcome.kind === 'category_not_found') {
        throw this.listCategoryNotFound();
      }
      if (outcome.kind !== 'completed') {
        throw itemizeGraphqlError(
          'Workspace list could not be created',
          'SERVICE_UNAVAILABLE',
        );
      }
      return this.mapList(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateList(
    userId: number,
    listId: number,
    input: UpdateWorkspaceListInput,
  ): Promise<WorkspaceList> {
    this.listId(listId);
    const values: Partial<CreateWorkspaceListValues> = {};
    if (input.title !== undefined) {
      values.title = this.listTitle(input.title);
    }
    if (input.category !== undefined) {
      values.category = this.listCategory(input.category);
    }
    if (input.items !== undefined) {
      if (input.items === null) {
        throw itemizeGraphqlError(
          'List items cannot be null',
          'BAD_USER_INPUT',
          { field: 'items', reason: 'INVALID_LIST_ITEMS' },
        );
      }
      values.items = this.listItems(input.items);
    }
    if (input.colorValue !== undefined) {
      values.colorValue = this.listColor(input.colorValue);
    }
    if (input.positionX !== undefined) {
      values.positionX = this.listCoordinate(input.positionX, 'positionX');
    }
    if (input.positionY !== undefined) {
      values.positionY = this.listCoordinate(input.positionY, 'positionY');
    }
    if (input.width !== undefined) {
      values.width = this.listDimension(input.width, 'width');
    }
    if (input.height !== undefined) {
      values.height = this.listDimension(input.height, 'height');
    }
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError(
        'Workspace list update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_LIST_UPDATE' },
      );
    }
    const update: UpdateWorkspaceListValues = {
      ...values,
      mutationId: this.mutationId(input.mutationId),
      expectedUpdatedAt: this.expectedUpdatedAt(input.expectedUpdatedAt),
    };

    try {
      const outcome = await this.content.updateList(userId, listId, update);
      if (outcome.kind === 'not_found') throw this.listNotFound();
      if (outcome.kind === 'category_not_found') {
        throw this.listCategoryNotFound();
      }
      if (outcome.kind === 'conflict') {
        throw itemizeGraphqlError(
          'Workspace list changed since it was loaded',
          'CONFLICT',
          {
            reason: 'STALE_LIST_REVISION',
            currentUpdatedAt: outcome.currentUpdatedAt.toISOString(),
          },
        );
      }
      return this.mapList(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteList(
    userId: number,
    listId: number,
    mutationId: string,
  ): Promise<number> {
    this.listId(listId);
    const normalizedMutationId = this.mutationId(mutationId);
    try {
      const outcome = await this.content.deleteList(
        userId,
        listId,
        normalizedMutationId,
      );
      if (outcome.kind === 'not_found') throw this.listNotFound();
      return outcome.deletedId;
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

  async createWhiteboard(
    userId: number,
    input: CreateWorkspaceWhiteboardInput,
  ): Promise<WorkspaceWhiteboard> {
    const values: CreateWorkspaceWhiteboardValues = {
      title: input.title === undefined
        ? 'Untitled Whiteboard'
        : this.whiteboardTitle(input.title),
      category: input.category === undefined
        ? 'General'
        : this.whiteboardCategory(input.category),
      canvasData: input.canvasData === undefined
        ? '{"paths":[],"shapes":[]}'
        : this.whiteboardCanvasData(input.canvasData),
      canvasWidth: input.canvasWidth === undefined
        ? 750
        : this.whiteboardDimension(input.canvasWidth, 'canvasWidth'),
      canvasHeight: input.canvasHeight === undefined
        ? 620
        : this.whiteboardDimension(input.canvasHeight, 'canvasHeight'),
      backgroundColor: input.backgroundColor === undefined
        ? '#FFFFFF'
        : this.whiteboardRequiredColor(
            input.backgroundColor,
            'backgroundColor',
          ),
      positionX: input.positionX === undefined
        ? 2000
        : this.whiteboardCoordinate(input.positionX, 'positionX'),
      positionY: input.positionY === undefined
        ? 2000
        : this.whiteboardCoordinate(input.positionY, 'positionY'),
      zIndex: input.zIndex === undefined
        ? 0
        : this.whiteboardInteger(input.zIndex, 'zIndex'),
      colorValue: input.colorValue === undefined
        ? '#3B82F6'
        : this.whiteboardOptionalColor(input.colorValue),
    };
    try {
      const outcome = await this.content.createWhiteboard(userId, values);
      if (outcome.kind === 'category_not_found') {
        throw this.whiteboardCategoryNotFound();
      }
      if (outcome.kind !== 'completed') {
        throw itemizeGraphqlError(
          'Workspace whiteboard could not be created',
          'SERVICE_UNAVAILABLE',
        );
      }
      return this.mapWhiteboard(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateWhiteboard(
    userId: number,
    whiteboardId: number,
    input: UpdateWorkspaceWhiteboardInput,
  ): Promise<WorkspaceWhiteboard> {
    this.whiteboardId(whiteboardId);
    const values: Partial<CreateWorkspaceWhiteboardValues> = {};
    if (input.title !== undefined) {
      values.title = this.whiteboardTitle(input.title);
    }
    if (input.category !== undefined) {
      values.category = this.whiteboardCategory(input.category);
    }
    if (input.canvasData !== undefined) {
      values.canvasData = this.whiteboardCanvasData(input.canvasData);
    }
    if (input.canvasWidth !== undefined) {
      values.canvasWidth = this.whiteboardDimension(
        input.canvasWidth,
        'canvasWidth',
      );
    }
    if (input.canvasHeight !== undefined) {
      values.canvasHeight = this.whiteboardDimension(
        input.canvasHeight,
        'canvasHeight',
      );
    }
    if (input.backgroundColor !== undefined) {
      values.backgroundColor = this.whiteboardRequiredColor(
        input.backgroundColor,
        'backgroundColor',
      );
    }
    if (input.positionX !== undefined) {
      values.positionX = this.whiteboardCoordinate(
        input.positionX,
        'positionX',
      );
    }
    if (input.positionY !== undefined) {
      values.positionY = this.whiteboardCoordinate(
        input.positionY,
        'positionY',
      );
    }
    if (input.zIndex !== undefined) {
      values.zIndex = this.whiteboardInteger(input.zIndex, 'zIndex');
    }
    if (input.colorValue !== undefined) {
      values.colorValue = this.whiteboardOptionalColor(input.colorValue);
    }
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError(
        'Workspace whiteboard update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_WHITEBOARD_UPDATE' },
      );
    }
    const update: UpdateWorkspaceWhiteboardValues = {
      ...values,
      mutationId: this.mutationId(input.mutationId),
      expectedUpdatedAt: this.expectedUpdatedAt(
        input.expectedUpdatedAt,
        'WHITEBOARD',
      ),
    };
    try {
      const outcome = await this.content.updateWhiteboard(
        userId,
        whiteboardId,
        update,
      );
      if (outcome.kind === 'not_found') throw this.whiteboardNotFound();
      if (outcome.kind === 'category_not_found') {
        throw this.whiteboardCategoryNotFound();
      }
      if (outcome.kind === 'conflict') {
        throw itemizeGraphqlError(
          'Workspace whiteboard changed since it was loaded',
          'CONFLICT',
          {
            reason: 'STALE_WHITEBOARD_REVISION',
            currentUpdatedAt: outcome.currentUpdatedAt.toISOString(),
          },
        );
      }
      return this.mapWhiteboard(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteWhiteboard(
    userId: number,
    whiteboardId: number,
    mutationId: string,
  ): Promise<number> {
    this.whiteboardId(whiteboardId);
    const normalizedMutationId = this.mutationId(mutationId);
    try {
      const outcome = await this.content.deleteWhiteboard(
        userId,
        whiteboardId,
        normalizedMutationId,
      );
      if (outcome.kind === 'not_found') throw this.whiteboardNotFound();
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

  private mapWhiteboard(
    row: WorkspaceWhiteboardRow,
  ): WorkspaceWhiteboard {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      title: row.title ?? 'Untitled Whiteboard',
      category: row.category ?? 'General',
      categoryId: row.category_id === null ? null : Number(row.category_id),
      canvasData: JSON.stringify(row.canvas_data ?? []),
      canvasWidth: Number(row.canvas_width ?? 750),
      canvasHeight: Number(row.canvas_height ?? 620),
      backgroundColor: row.background_color ?? '#FFFFFF',
      positionX: Number(row.position_x ?? 0),
      positionY: Number(row.position_y ?? 0),
      zIndex: Number(row.z_index ?? 0),
      colorValue: row.color_value,
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

  private listId(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Workspace list ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_LIST_ID' },
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

  private listTitle(value: string | null): string {
    const title = value?.trim();
    if (!title || title.length > 200) {
      throw itemizeGraphqlError(
        'List title must contain between 1 and 200 characters',
        'BAD_USER_INPUT',
        { field: 'title', reason: 'INVALID_LIST_TITLE' },
      );
    }
    return title;
  }

  private listCategory(value: string | null): string {
    const category = value?.trim();
    if (!category || category.length > 50) {
      throw itemizeGraphqlError(
        'List category must contain between 1 and 50 characters',
        'BAD_USER_INPUT',
        { field: 'category', reason: 'INVALID_LIST_CATEGORY' },
      );
    }
    return category;
  }

  private listColor(value: string | null): string | null {
    if (value === null) return null;
    const color = value.trim();
    if (!COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        'List color must be a six-digit hex color',
        'BAD_USER_INPUT',
        { field: 'colorValue', reason: 'INVALID_LIST_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private listCoordinate(value: number | null, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw itemizeGraphqlError(
        `${field} must be a finite number`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_LIST_GEOMETRY' },
      );
    }
    return value;
  }

  private listDimension(value: number | null, field: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
      throw itemizeGraphqlError(
        `${field} must be a positive integer`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_LIST_GEOMETRY' },
      );
    }
    return value as number;
  }

  private listItems(items: WorkspaceListItemInput[]): WorkspaceListItem[] {
    if (items.length > MAX_LIST_ITEMS) {
      throw itemizeGraphqlError(
        `List cannot contain more than ${MAX_LIST_ITEMS} items`,
        'BAD_USER_INPUT',
        { field: 'items', reason: 'TOO_MANY_LIST_ITEMS' },
      );
    }
    const ids = new Set<string>();
    const normalized = items.map((item, index) => {
      const id = item.id?.trim();
      const text = item.text?.trim();
      if (!id || id.length > 100 || ids.has(id)) {
        throw itemizeGraphqlError(
          'List item IDs must be unique and contain between 1 and 100 characters',
          'BAD_USER_INPUT',
          { field: `items.${index}.id`, reason: 'INVALID_LIST_ITEM_ID' },
        );
      }
      if (!text || text.length > MAX_LIST_ITEM_TEXT_LENGTH) {
        throw itemizeGraphqlError(
          `List item text must contain between 1 and ${MAX_LIST_ITEM_TEXT_LENGTH} characters`,
          'BAD_USER_INPUT',
          { field: `items.${index}.text`, reason: 'INVALID_LIST_ITEM_TEXT' },
        );
      }
      if (typeof item.completed !== 'boolean') {
        throw itemizeGraphqlError(
          'List item completed must be a boolean',
          'BAD_USER_INPUT',
          {
            field: `items.${index}.completed`,
            reason: 'INVALID_LIST_ITEM_COMPLETED',
          },
        );
      }
      ids.add(id);
      return { id, text, completed: item.completed };
    });
    if (
      Buffer.byteLength(JSON.stringify(normalized), 'utf8') >
      MAX_LIST_ITEMS_JSON_BYTES
    ) {
      throw itemizeGraphqlError(
        'Serialized list items must not exceed 40000 bytes',
        'BAD_USER_INPUT',
        { field: 'items', reason: 'LIST_ITEMS_TOO_LARGE' },
      );
    }
    return normalized;
  }

  private expectedUpdatedAt(value: Date, subject = 'LIST'): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw itemizeGraphqlError(
        'expectedUpdatedAt must be a valid timestamp',
        'BAD_USER_INPUT',
        {
          field: 'expectedUpdatedAt',
          reason: `INVALID_${subject}_REVISION`,
        },
      );
    }
    return date;
  }

  private whiteboardId(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Workspace whiteboard ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_WHITEBOARD_ID' },
      );
    }
  }

  private whiteboardTitle(value: string | null): string {
    const title = value?.trim();
    if (!title || title.length > 255) {
      throw itemizeGraphqlError(
        'Whiteboard title must contain between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'title', reason: 'INVALID_WHITEBOARD_TITLE' },
      );
    }
    return title;
  }

  private whiteboardCategory(value: string | null): string {
    const category = value?.trim();
    if (!category || category.length > 50) {
      throw itemizeGraphqlError(
        'Whiteboard category must contain between 1 and 50 characters',
        'BAD_USER_INPUT',
        { field: 'category', reason: 'INVALID_WHITEBOARD_CATEGORY' },
      );
    }
    return category;
  }

  private whiteboardCanvasData(value: string | null): string {
    if (
      typeof value !== 'string' ||
      Buffer.byteLength(value, 'utf8') > MAX_WHITEBOARD_JSON_BYTES
    ) {
      throw itemizeGraphqlError(
        'Whiteboard canvas data must not exceed 1048576 bytes',
        'BAD_USER_INPUT',
        { field: 'canvasData', reason: 'WHITEBOARD_CANVAS_TOO_LARGE' },
      );
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        parsed === null ||
        typeof parsed !== 'object'
      ) {
        throw new Error('Canvas JSON must be an object or array');
      }
      return JSON.stringify(parsed);
    } catch {
      throw itemizeGraphqlError(
        'Whiteboard canvas data must be valid object or array JSON',
        'BAD_USER_INPUT',
        { field: 'canvasData', reason: 'INVALID_WHITEBOARD_CANVAS' },
      );
    }
  }

  private whiteboardDimension(
    value: number | null,
    field: string,
  ): number {
    if (
      !Number.isSafeInteger(value) ||
      (value as number) < 1 ||
      (value as number) > MAX_WHITEBOARD_DIMENSION
    ) {
      throw itemizeGraphqlError(
        `${field} must be an integer between 1 and ${MAX_WHITEBOARD_DIMENSION}`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_WHITEBOARD_GEOMETRY' },
      );
    }
    return value as number;
  }

  private whiteboardCoordinate(
    value: number | null,
    field: string,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw itemizeGraphqlError(
        `${field} must be a finite number`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_WHITEBOARD_GEOMETRY' },
      );
    }
    return value;
  }

  private whiteboardInteger(value: number | null, field: string): number {
    if (!Number.isSafeInteger(value)) {
      throw itemizeGraphqlError(
        `${field} must be an integer`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_WHITEBOARD_GEOMETRY' },
      );
    }
    return value as number;
  }

  private whiteboardRequiredColor(
    value: string | null,
    field: string,
  ): string {
    const color = value?.trim();
    if (!color || !COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        `${field} must be a six-digit hex color`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_WHITEBOARD_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private whiteboardOptionalColor(value: string | null): string | null {
    if (value === null) return null;
    return this.whiteboardRequiredColor(value, 'colorValue');
  }

  private whiteboardNotFound(): GraphQLError {
    return itemizeGraphqlError('Workspace whiteboard not found', 'NOT_FOUND');
  }

  private whiteboardCategoryNotFound(): GraphQLError {
    return itemizeGraphqlError(
      'Whiteboard category was not found',
      'BAD_USER_INPUT',
      { field: 'category', reason: 'WHITEBOARD_CATEGORY_NOT_FOUND' },
    );
  }

  private listNotFound(): GraphQLError {
    return itemizeGraphqlError('Workspace list not found', 'NOT_FOUND');
  }

  private listCategoryNotFound(): GraphQLError {
    return itemizeGraphqlError(
      'List category was not found',
      'BAD_USER_INPUT',
      { field: 'category', reason: 'LIST_CATEGORY_NOT_FOUND' },
    );
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
