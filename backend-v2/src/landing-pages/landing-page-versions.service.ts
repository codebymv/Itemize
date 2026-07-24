import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  DeleteLandingPageVersionResult,
  LandingPageVersion,
  LandingPageVersionsResult,
} from './landing-page-version.types';
import {
  LandingPageVersionRow,
  LandingPageVersionsRepository,
} from './landing-page-versions.repository';

@Injectable()
export class LandingPageVersionsService {
  constructor(private readonly versions: LandingPageVersionsRepository) {}

  async list(
    organizationId: number,
    pageId: number,
  ): Promise<LandingPageVersionsResult> {
    this.id(pageId, 'pageId');
    const result = await this.versions.list(organizationId, pageId);
    if (!result) throw this.notFound('Landing page not found');
    return {
      versions: result.versions.map((row) => this.map(row)),
      currentVersionId: result.currentVersionId,
    };
  }

  async get(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<LandingPageVersion> {
    this.ids(pageId, versionId);
    const row = await this.versions.find(organizationId, pageId, versionId);
    if (!row) throw this.notFound('Landing page version not found');
    return this.map(row);
  }

  async create(
    organizationId: number,
    pageId: number,
    userId: number,
    description?: string | null,
  ): Promise<LandingPageVersion> {
    this.id(pageId, 'pageId');
    const normalized = this.description(description);
    const row = await this.versions.create(
      organizationId,
      pageId,
      userId,
      normalized,
    );
    if (!row) throw this.notFound('Landing page not found');
    return this.map(row);
  }

  async publish(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<LandingPageVersion> {
    this.ids(pageId, versionId);
    try {
      const result = await this.versions.publish(
        organizationId,
        pageId,
        versionId,
      );
      if (result.status === 'not_found') {
        throw this.notFound('Landing page version not found');
      }
      if (result.status === 'invalid_snapshot') {
        throw itemizeGraphqlError(
          'Landing page version snapshot is invalid',
          'CONFLICT',
          { reason: 'INVALID_VERSION_SNAPSHOT' },
        );
      }
      return this.map(result.version);
    } catch (error) {
      if (this.pgCode(error) === '23505') {
        throw itemizeGraphqlError(
          'The version slug is already used by another landing page',
          'CONFLICT',
          { field: 'slug', reason: 'VERSION_SLUG_CONFLICT' },
        );
      }
      throw error;
    }
  }

  async delete(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<DeleteLandingPageVersionResult> {
    this.ids(pageId, versionId);
    const result = await this.versions.delete(
      organizationId,
      pageId,
      versionId,
    );
    if (result === 'not_found') {
      throw this.notFound('Landing page version not found');
    }
    if (result === 'current') {
      throw itemizeGraphqlError(
        'Cannot delete the current published version',
        'BAD_USER_INPUT',
        { reason: 'CURRENT_VERSION' },
      );
    }
    return { deletedId: versionId };
  }

  async restore(
    organizationId: number,
    pageId: number,
    versionId: number,
    userId: number,
  ): Promise<LandingPageVersion> {
    this.ids(pageId, versionId);
    const row = await this.versions.restore(
      organizationId,
      pageId,
      versionId,
      userId,
    );
    if (!row) throw this.notFound('Landing page version not found');
    return this.map(row);
  }

  private map(row: LandingPageVersionRow): LandingPageVersion {
    const content =
      typeof row.content === 'string'
        ? (JSON.parse(row.content) as Record<string, unknown>)
        : row.content;
    return {
      id: row.id,
      pageId: row.page_id,
      versionNumber: row.version_number,
      content,
      description: row.description,
      createdBy: row.created_by,
      createdByName: row.created_by_name ?? null,
      publishedAt: row.published_at,
      isCurrent: Boolean(row.is_current),
      createdAt: row.created_at,
    };
  }

  private description(value?: string | null): string | null {
    if (value === undefined || value === null || value.trim() === '') return null;
    const normalized = value.trim();
    if (normalized.length > 1000) {
      throw itemizeGraphqlError(
        'description cannot exceed 1000 characters',
        'BAD_USER_INPUT',
        { field: 'description' },
      );
    }
    return normalized;
  }

  private ids(pageId: number, versionId: number): void {
    this.id(pageId, 'pageId');
    this.id(versionId, 'versionId');
  }

  private id(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw itemizeGraphqlError(
        `${field} must be a positive integer`,
        'BAD_USER_INPUT',
        { field },
      );
    }
  }

  private notFound(message: string) {
    return itemizeGraphqlError(message, 'NOT_FOUND');
  }

  private pgCode(error: unknown): string {
    return typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
  }
}
