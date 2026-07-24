import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  AddLandingPageSectionInput,
  CreateLandingPageInput,
  LandingPageFilterInput,
  LandingPageSectionInput,
  UpdateLandingPageInput,
  UpdateLandingPageSectionInput,
} from './landing-page.inputs';
import {
  DeleteLandingPageResult,
  DeleteLandingPageSectionResult,
  LandingPage,
  LandingPageAnalytics,
  LandingPagePage,
  LandingPageSection,
  LandingPageSectionsResult,
} from './landing-page.types';
import {
  LandingPageRow,
  LandingPageSectionRow,
  LandingPagesRepository,
  PageAggregate,
  SectionValue,
  UpdatePageValue,
} from './landing-pages.repository';

const PAGE_STATUSES = new Set(['draft', 'published', 'archived']);
const SECTION_TYPES = new Set([
  'hero', 'text', 'image', 'video', 'form', 'cta', 'testimonials', 'pricing',
  'faq', 'features', 'gallery', 'countdown', 'html', 'divider', 'social',
  'header', 'footer', 'columns', 'spacer', 'button', 'logo_cloud', 'stats',
  'team', 'contact', 'map',
]);
const DEFAULT_THEME = {
  primaryColor: '#3B82F6',
  secondaryColor: '#1E40AF',
  backgroundColor: '#FFFFFF',
  textColor: '#1F2937',
  fontFamily: 'Inter',
  headingFont: 'Inter',
  borderRadius: 8,
  spacing: 'normal',
};
const DEFAULT_SETTINGS = {
  showNavbar: false,
  showFooter: false,
  enableAnalytics: true,
  password: null,
  expiresAt: null,
};

@Injectable()
export class LandingPagesService {
  constructor(private readonly pages: LandingPagesRepository) {}

  async list(
    organizationId: number,
    filter?: LandingPageFilterInput,
    page?: PageInput,
  ): Promise<LandingPagePage> {
    const normalizedPage = this.page(page);
    const status =
      !filter?.status || filter.status === 'all'
        ? undefined
        : this.status(filter.status);
    const search = filter?.search
      ? this.text(filter.search, 'search', 200)
      : undefined;
    const result = await this.pages.list(
      organizationId,
      status,
      search,
      normalizedPage.page,
      normalizedPage.pageSize,
    );
    return {
      nodes: result.rows.map((row) => this.mapPage(row, [])),
      pageInfo: pageInfo(
        normalizedPage.page,
        normalizedPage.pageSize,
        result.total,
      ),
    };
  }

  async get(organizationId: number, pageId: number): Promise<LandingPage> {
    this.id(pageId, 'id');
    const value = await this.pages.find(organizationId, pageId);
    if (!value) throw this.notFound();
    return this.mapAggregate(value);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateLandingPageInput,
  ): Promise<LandingPage> {
    const name = this.text(input.name, 'name', 255);
    const slug = input.slug
      ? this.slug(input.slug)
      : this.slug(name);
    const outcome = await this.withConstraintMapping(() =>
      this.pages.create(organizationId, userId, {
        name,
        description: this.nullableText(input.description, 'description', 10000),
        slug,
        autoAllocateSlug: !input.slug,
        theme: this.record(input.theme ?? DEFAULT_THEME, 'theme'),
        settings: this.record(input.settings ?? DEFAULT_SETTINGS, 'settings'),
        seoTitle: this.nullableText(input.seoTitle, 'seoTitle', 255),
        seoDescription: this.nullableText(
          input.seoDescription,
          'seoDescription',
          500,
        ),
        seoKeywords: this.nullableText(input.seoKeywords, 'seoKeywords', 5000),
        ogImage: this.nullableText(input.ogImage, 'ogImage', 500),
        sections: this.sections(input.sections ?? []),
      }),
    );
    if ('limit' in outcome) {
      throw itemizeGraphqlError(
        `You've reached your landing page limit (${outcome.limit.current}/${outcome.limit.limit}). Please upgrade your plan.`,
        'FORBIDDEN',
        { reason: 'PLAN_LIMIT_REACHED', ...outcome.limit },
      );
    }
    return this.mapAggregate(outcome);
  }

  async update(
    organizationId: number,
    pageId: number,
    input: UpdateLandingPageInput,
  ): Promise<LandingPage> {
    this.id(pageId, 'id');
    for (const key of ['name', 'slug', 'status', 'theme', 'settings'] as const) {
      if (input[key] === null) {
        throw itemizeGraphqlError(`${key} cannot be null`, 'BAD_USER_INPUT', {
          field: key,
        });
      }
    }
    const value: UpdatePageValue = {
      ...(input.name !== undefined
        ? { name: this.text(input.name as string, 'name', 255) }
        : {}),
      ...(input.description !== undefined
        ? {
            description: this.nullableText(
              input.description,
              'description',
              10000,
            ),
          }
        : {}),
      ...(input.slug !== undefined
        ? { slug: this.slug(input.slug as string) }
        : {}),
      ...(input.status !== undefined
        ? { status: this.status(input.status as string) }
        : {}),
      ...(input.theme !== undefined
        ? { theme: this.record(input.theme as Record<string, unknown>, 'theme') }
        : {}),
      ...(input.settings !== undefined
        ? {
            settings: this.record(
              input.settings as Record<string, unknown>,
              'settings',
            ),
          }
        : {}),
      ...(input.seoTitle !== undefined
        ? { seoTitle: this.nullableText(input.seoTitle, 'seoTitle', 255) }
        : {}),
      ...(input.seoDescription !== undefined
        ? {
            seoDescription: this.nullableText(
              input.seoDescription,
              'seoDescription',
              500,
            ),
          }
        : {}),
      ...(input.seoKeywords !== undefined
        ? {
            seoKeywords: this.nullableText(
              input.seoKeywords,
              'seoKeywords',
              5000,
            ),
          }
        : {}),
      ...(input.ogImage !== undefined
        ? { ogImage: this.nullableText(input.ogImage, 'ogImage', 500) }
        : {}),
      ...(input.faviconUrl !== undefined
        ? {
            faviconUrl: this.nullableText(
              input.faviconUrl,
              'faviconUrl',
              500,
            ),
          }
        : {}),
      ...(input.customCss !== undefined
        ? { customCss: this.nullableText(input.customCss, 'customCss', 200000) }
        : {}),
      ...(input.customJs !== undefined
        ? { customJs: this.nullableText(input.customJs, 'customJs', 200000) }
        : {}),
      ...(input.customHead !== undefined
        ? {
            customHead: this.nullableText(
              input.customHead,
              'customHead',
              200000,
            ),
          }
        : {}),
    };
    const result = await this.withConstraintMapping(() =>
      this.pages.update(organizationId, pageId, value),
    );
    if (!result) throw this.notFound();
    return this.mapAggregate(result);
  }

  async delete(
    organizationId: number,
    pageId: number,
  ): Promise<DeleteLandingPageResult> {
    this.id(pageId, 'id');
    if (!(await this.pages.delete(organizationId, pageId))) throw this.notFound();
    return { deletedId: pageId };
  }

  async duplicate(
    organizationId: number,
    userId: number,
    pageId: number,
  ): Promise<LandingPage> {
    this.id(pageId, 'id');
    const result = await this.pages.duplicate(organizationId, userId, pageId);
    if (!result) throw this.notFound();
    if ('limit' in result) {
      throw itemizeGraphqlError(
        `You've reached your landing page limit (${result.limit.current}/${result.limit.limit}). Please upgrade your plan.`,
        'FORBIDDEN',
        { reason: 'PLAN_LIMIT_REACHED', ...result.limit },
      );
    }
    return this.mapAggregate(result);
  }

  async replaceSections(
    organizationId: number,
    pageId: number,
    inputs: LandingPageSectionInput[],
  ): Promise<LandingPageSectionsResult> {
    this.id(pageId, 'id');
    const result = await this.pages.replaceSections(
      organizationId,
      pageId,
      this.sections(inputs),
    );
    if (!result) throw this.notFound();
    return { sections: result.map((row) => this.mapSection(row)) };
  }

  async addSection(
    organizationId: number,
    pageId: number,
    input: AddLandingPageSectionInput,
  ): Promise<LandingPageSection> {
    this.id(pageId, 'id');
    const position =
      input.position === undefined
        ? undefined
        : this.nonNegativeInt(input.position, 'position');
    const result = await this.pages.addSection(
      organizationId,
      pageId,
      this.section(input),
      position,
    );
    if (!result) throw this.notFound();
    return this.mapSection(result);
  }

  async updateSection(
    organizationId: number,
    pageId: number,
    sectionId: number,
    input: UpdateLandingPageSectionInput,
  ): Promise<LandingPageSection> {
    this.id(pageId, 'pageId');
    this.id(sectionId, 'sectionId');
    if (
      input.sectionType === null ||
      input.content === null ||
      input.settings === null
    ) {
      throw itemizeGraphqlError(
        'sectionType, content, and settings cannot be null',
        'BAD_USER_INPUT',
      );
    }
    const value: Partial<SectionValue> = {
      ...(input.sectionType !== undefined
        ? { sectionType: this.sectionType(input.sectionType as string) }
        : {}),
      ...(input.name !== undefined
        ? { name: this.nullableText(input.name, 'name', 255) }
        : {}),
      ...(input.content !== undefined
        ? {
            content: this.record(
              input.content as Record<string, unknown>,
              'content',
            ),
          }
        : {}),
      ...(input.settings !== undefined
        ? {
            settings: this.record(
              input.settings as Record<string, unknown>,
              'settings',
            ),
          }
        : {}),
    };
    const result = await this.pages.updateSection(
      organizationId,
      pageId,
      sectionId,
      value,
    );
    if (!result) throw this.sectionNotFound();
    return this.mapSection(result);
  }

  async deleteSection(
    organizationId: number,
    pageId: number,
    sectionId: number,
  ): Promise<DeleteLandingPageSectionResult> {
    this.id(pageId, 'pageId');
    this.id(sectionId, 'sectionId');
    if (!(await this.pages.deleteSection(organizationId, pageId, sectionId))) {
      throw this.sectionNotFound();
    }
    return { deletedId: sectionId };
  }

  async reorderSections(
    organizationId: number,
    pageId: number,
    sectionIds: number[],
  ): Promise<LandingPageSectionsResult> {
    this.id(pageId, 'pageId');
    if (sectionIds.length > 250 || new Set(sectionIds).size !== sectionIds.length) {
      throw itemizeGraphqlError(
        'sectionIds must contain at most 250 unique IDs',
        'BAD_USER_INPUT',
        { field: 'sectionIds' },
      );
    }
    sectionIds.forEach((id) => this.id(id, 'sectionIds'));
    const result = await this.pages.reorderSections(
      organizationId,
      pageId,
      sectionIds,
    );
    if (result === null) throw this.notFound();
    if (!result.matched) {
      throw itemizeGraphqlError(
        'sectionIds must exactly match the page sections',
        'BAD_USER_INPUT',
        { field: 'sectionIds', reason: 'SECTION_SET_MISMATCH' },
      );
    }
    return { sections: result.rows.map((row) => this.mapSection(row)) };
  }

  async analytics(
    organizationId: number,
    pageId: number,
    period = 30,
  ): Promise<LandingPageAnalytics> {
    this.id(pageId, 'id');
    const days = this.nonNegativeInt(period, 'period');
    if (days < 1 || days > 365) {
      throw itemizeGraphqlError('period must be between 1 and 365', 'BAD_USER_INPUT', {
        field: 'period',
      });
    }
    const rows = await this.pages.analytics(organizationId, pageId, days);
    if (!rows) throw this.notFound();
    return {
      period: days,
      overall: {
        totalViews: rows.overall.total_views,
        uniqueVisitors: rows.overall.unique_visitors,
        averageTimeOnPage: rows.overall.avg_time_on_page ?? 0,
        averageScrollDepth: rows.overall.avg_scroll_depth ?? 0,
        conversions: rows.overall.conversions,
      },
      viewsOverTime: rows.views.map((row) => ({
        date: row.date,
        views: row.views,
        uniqueVisitors: row.unique_visitors,
      })),
      devices: rows.devices.map((row) => ({
        deviceType: row.device_type,
        count: row.count,
      })),
      referrers: rows.referrers,
      utmSources: rows.utm.map((row) => ({
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        count: row.count,
      })),
    };
  }

  private mapAggregate(value: PageAggregate): LandingPage {
    return this.mapPage(value.page, value.sections);
  }

  private mapPage(
    row: LandingPageRow,
    sections: LandingPageSectionRow[],
  ): LandingPage {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      slug: row.slug,
      status: row.status,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      seoKeywords: row.seo_keywords,
      ogImage: row.og_image,
      faviconUrl: row.favicon_url,
      theme: row.theme ?? {},
      customCss: row.custom_css,
      customJs: row.custom_js,
      customHead: row.custom_head,
      settings: row.settings ?? {},
      currentVersionId: row.current_version_id,
      viewCount: Number(row.view_count ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      publishedAt: row.published_at,
      createdBy: row.created_by,
      createdByName: row.created_by_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sectionCount: Number(row.section_count ?? sections.length),
      sections: sections.map((section) => this.mapSection(section)),
    };
  }

  private mapSection(row: LandingPageSectionRow): LandingPageSection {
    return {
      id: row.id,
      pageId: row.page_id,
      organizationId: row.organization_id,
      sectionType: row.section_type,
      name: row.name,
      content: row.content ?? {},
      settings: row.settings ?? {},
      sectionOrder: row.section_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private sections(inputs: LandingPageSectionInput[]): SectionValue[] {
    if (inputs.length > 250) {
      throw itemizeGraphqlError('sections cannot exceed 250 entries', 'BAD_USER_INPUT', {
        field: 'sections',
      });
    }
    return inputs.map((input) => this.section(input));
  }

  private section(input: LandingPageSectionInput): SectionValue {
    return {
      sectionType: this.sectionType(input.sectionType),
      name: this.nullableText(input.name, 'name', 255),
      content: this.record(input.content ?? {}, 'content'),
      settings: this.record(input.settings ?? {}, 'settings'),
    };
  }

  private sectionType(value: string): string {
    if (!SECTION_TYPES.has(value)) {
      throw itemizeGraphqlError('Unsupported section type', 'BAD_USER_INPUT', {
        field: 'sectionType',
      });
    }
    return value;
  }

  private status(value: string): string {
    if (!PAGE_STATUSES.has(value)) {
      throw itemizeGraphqlError('Unsupported page status', 'BAD_USER_INPUT', {
        field: 'status',
      });
    }
    return value;
  }

  private slug(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
    if (!normalized) {
      throw itemizeGraphqlError('slug is invalid', 'BAD_USER_INPUT', {
        field: 'slug',
      });
    }
    return normalized;
  }

  private record(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(`${field} must be an object`, 'BAD_USER_INPUT', {
        field,
      });
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > 1_048_576) {
      throw itemizeGraphqlError(`${field} is too large`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value as Record<string, unknown>;
  }

  private text(value: string, field: string, max: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain between 1 and ${max} characters`,
        'BAD_USER_INPUT',
        { field },
      );
    }
    return normalized;
  }

  private nullableText(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    if (value.length > max) {
      throw itemizeGraphqlError(`${field} cannot exceed ${max} characters`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
  }

  private id(value: number, field: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
  }

  private nonNegativeInt(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw itemizeGraphqlError(`${field} must be a non-negative integer`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
  }

  private page(input?: PageInput): { page: number; pageSize: number } {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1) {
      throw itemizeGraphqlError('page must be at least 1', 'BAD_USER_INPUT');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw itemizeGraphqlError('pageSize must be between 1 and 100', 'BAD_USER_INPUT');
    }
    return { page, pageSize };
  }

  private notFound() {
    return itemizeGraphqlError('Landing page not found', 'NOT_FOUND');
  }

  private sectionNotFound() {
    return itemizeGraphqlError('Landing page section not found', 'NOT_FOUND');
  }

  private async withConstraintMapping<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String(error.code)
          : '';
      if (code === '23505') {
        throw itemizeGraphqlError('Landing page slug already exists', 'CONFLICT', {
          field: 'slug',
        });
      }
      throw error;
    }
  }
}
