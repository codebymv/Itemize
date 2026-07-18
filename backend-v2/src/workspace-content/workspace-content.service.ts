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
  WorkspaceContentRepository,
  WorkspaceListRow,
  WorkspaceNoteRow,
} from './workspace-content.repository';

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
