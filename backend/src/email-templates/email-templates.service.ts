import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateEmailTemplateInput,
  EmailTemplateFilterInput,
  UpdateEmailTemplateInput,
} from './email-template.inputs';
import {
  DeleteEmailTemplateResult,
  EmailTemplate,
  EmailTemplateCategory,
  EmailTemplatePage,
} from './email-template.types';
import { extractEmailTemplateVariables } from './email-template.variables';
import {
  EmailTemplateRow,
  EmailTemplatesRepository,
  EmailTemplateUpdates,
} from './email-templates.repository';

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly templates: EmailTemplatesRepository) {}

  async list(
    organizationId: number,
    filter: EmailTemplateFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<EmailTemplatePage> {
    const normalizedPage = this.page(page);
    const result = await this.templates.findPage({
      organizationId,
      ...(filter.category === undefined ? {} : { category: this.category(filter.category) }),
      ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      ...(filter.search === undefined ? {} : { searchPattern: this.search(filter.search) }),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    const total = this.count(result.total, 'emailTemplates.total');
    return {
      nodes: result.rows.map(this.map),
      pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, total),
    };
  }

  async detail(organizationId: number, id: number): Promise<EmailTemplate> {
    this.id(id);
    const row = await this.templates.findById(organizationId, id);
    if (!row) this.notFound();
    return this.map(row);
  }

  async categories(organizationId: number): Promise<EmailTemplateCategory[]> {
    return (await this.templates.categories(organizationId)).map((row) => ({
      category: row.category,
      count: this.count(row.count, `emailTemplateCategories.${row.category}`),
    }));
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateEmailTemplateInput,
  ): Promise<EmailTemplate> {
    const name = this.required(input.name, 'name', 255);
    const subject = this.required(input.subject, 'subject', 500, false);
    const bodyHtml = this.required(input.bodyHtml, 'bodyHtml', 1_000_000, false);
    const bodyText = this.optional(input.bodyText, 'bodyText', 1_000_000, false);
    return this.map(await this.templates.create(organizationId, userId, {
      name,
      subject,
      bodyHtml,
      bodyText,
      variables: extractEmailTemplateVariables(subject, bodyHtml, bodyText),
      category: this.category(input.category),
      isActive: input.isActive,
    }));
  }

  async update(
    organizationId: number,
    id: number,
    input: UpdateEmailTemplateInput,
  ): Promise<EmailTemplate> {
    this.id(id);
    for (const field of ['name', 'subject', 'bodyHtml', 'category', 'isActive'] as const) {
      if (input[field] === null) this.nullField(field);
    }
    const updates: EmailTemplateUpdates = {
      ...(input.name === undefined ? {} : { name: this.required(input.name as string, 'name', 255) }),
      ...(input.subject === undefined ? {} : { subject: this.required(input.subject as string, 'subject', 500, false) }),
      ...(input.bodyHtml === undefined ? {} : { bodyHtml: this.required(input.bodyHtml as string, 'bodyHtml', 1_000_000, false) }),
      ...(Object.prototype.hasOwnProperty.call(input, 'bodyText')
        ? { bodyText: this.optional(input.bodyText, 'bodyText', 1_000_000, false) }
        : {}),
      ...(input.category === undefined ? {} : { category: this.category(input.category as string) }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive as boolean }),
    };
    const row = await this.templates.update(organizationId, id, updates);
    if (!row) this.notFound();
    return this.map(row);
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<EmailTemplate> {
    this.id(id);
    const row = await this.templates.duplicate(organizationId, id, userId);
    if (!row) this.notFound();
    return this.map(row);
  }

  async delete(organizationId: number, id: number): Promise<DeleteEmailTemplateResult> {
    this.id(id);
    if (!(await this.templates.delete(organizationId, id))) this.notFound();
    return { deletedId: id, success: true };
  }

  private page(input: PageInput) {
    if (!Number.isInteger(input.page) || input.page < 1 ||
      !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page', reason: 'INVALID_PAGE',
      });
    }
    return { page: input.page, pageSize: input.pageSize, offset: (input.page - 1) * input.pageSize };
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', {
        field: 'id', reason: 'INVALID_EMAIL_TEMPLATE_ID',
      });
    }
  }

  private required(value: string, field: string, max: number, trim = true): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
      throw itemizeGraphqlError(`${field} is required and must not exceed ${max} characters`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_EMAIL_TEMPLATE_${field.toUpperCase()}`,
      });
    }
    return trim ? value.trim() : value;
  }

  private optional(
    value: string | null | undefined,
    field: string,
    max: number,
    trim = true,
  ): string | null {
    if (value === undefined || value === null || value.length === 0) return null;
    if (value.length > max) {
      throw itemizeGraphqlError(`${field} must not exceed ${max} characters`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_EMAIL_TEMPLATE_${field.toUpperCase()}`,
      });
    }
    return trim ? value.trim() : value;
  }

  private category(value: string): string {
    return this.required(value, 'category', 100);
  }

  private search(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError('search must be between 1 and 100 characters', 'BAD_USER_INPUT', {
        field: 'search', reason: 'INVALID_EMAIL_TEMPLATE_SEARCH',
      });
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private count(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
      throw new Error(`Unsafe email-template count at ${field}`);
    }
    return parsed;
  }

  private variables(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field, reason: 'NULL_EMAIL_TEMPLATE_FIELD',
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Email template not found', 'NOT_FOUND');
  }

  private readonly map = (row: EmailTemplateRow): EmailTemplate => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variables: this.variables(row.variables),
    category: row.category,
    isActive: row.is_active,
    createdById: row.created_by === null ? null : Number(row.created_by),
    createdByName: row.created_by_name ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
