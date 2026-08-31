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
  EmailTemplatePreview,
} from './email-template.types';
import { extractEmailTemplateVariables } from './email-template.variables';
import {
  sanitizeEmailTemplateHtml,
} from './email-template-content';
import { renderEmailTemplateDocument } from './email-template-renderer';
import {
  EmailTemplateRow,
  EmailTemplatesRepository,
  EmailTemplateUpdates,
  EmailTemplateValues,
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
      stats: {
        total: this.count(result.stats.total, 'emailTemplates.stats.total'),
        active: this.count(result.stats.active, 'emailTemplates.stats.active'),
        inactive: this.count(result.stats.inactive, 'emailTemplates.stats.inactive'),
        categories: this.count(result.stats.categories, 'emailTemplates.stats.categories'),
      },
      categories: result.categories.map((row) => ({
        category: row.category,
        count: this.count(row.count, `emailTemplates.categories.${row.category}`),
      })),
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
    const subject = this.singleLineRequired(input.subject, 'subject', 500);
    const preheader = this.optionalSingleLine(input.preheader, 'preheader', 255);
    const bodyHtml = this.sanitizedHtml(input.bodyHtml);
    const bodyText = this.optional(input.bodyText, 'bodyText', 1_000_000, false);
    return this.map(await this.templates.create(organizationId, userId, {
      name,
      subject,
      preheader,
      bodyHtml,
      bodyText,
      variables: extractEmailTemplateVariables(subject, preheader, bodyHtml, bodyText),
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
      ...(input.subject === undefined ? {} : { subject: this.singleLineRequired(input.subject as string, 'subject', 500) }),
      ...(Object.prototype.hasOwnProperty.call(input, 'preheader')
        ? { preheader: this.optionalSingleLine(input.preheader, 'preheader', 255) }
        : {}),
      ...(input.bodyHtml === undefined ? {} : { bodyHtml: this.sanitizedHtml(input.bodyHtml as string) }),
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

  async createDraft(
    organizationId: number,
    userId: number,
    input: CreateEmailTemplateInput,
  ): Promise<EmailTemplate> {
    const values = this.contentValues(input);
    return this.map(await this.templates.createDraft(organizationId, userId, values));
  }

  async saveDraft(
    organizationId: number,
    id: number,
    userId: number,
    input: CreateEmailTemplateInput,
  ): Promise<EmailTemplate> {
    this.id(id);
    const row = await this.templates.saveDraft(organizationId, id, userId, this.contentValues(input));
    if (!row) this.notFound();
    return this.map(row);
  }

  async publishDraft(
    organizationId: number,
    id: number,
    userId: number,
    isActive?: boolean,
  ): Promise<EmailTemplate> {
    this.id(id);
    const row = await this.templates.publishDraft(organizationId, id, userId, isActive);
    if (!row) {
      throw itemizeGraphqlError('Email template has no draft to publish', 'CONFLICT', {
        field: 'id', reason: 'EMAIL_TEMPLATE_DRAFT_REQUIRED',
      });
    }
    return this.map(row);
  }

  preview(input: CreateEmailTemplateInput): EmailTemplatePreview {
    const subject = this.singleLineRequired(input.subject, 'subject', 500);
    const preheader = this.optionalSingleLine(input.preheader, 'preheader', 255) || subject;
    const bodyHtml = this.sanitizedHtml(input.bodyHtml);
    const bodyText = this.optional(input.bodyText, 'bodyText', 1_000_000, false);
    const sample = {
      first_name: 'Test', last_name: 'Recipient', full_name: 'Test Recipient',
      email: 'test@example.com', phone: '+1 555-555-0100', company: 'Example Company',
      job_title: 'Customer',
    };
    const rendered = renderEmailTemplateDocument({
      subject, preheader, bodyHtml, bodyText, data: sample,
    });
    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      variables: extractEmailTemplateVariables(subject, preheader, bodyHtml, bodyText),
    };
  }

  private contentValues(input: CreateEmailTemplateInput): EmailTemplateValues {
    const name = this.required(input.name, 'name', 255);
    const subject = this.singleLineRequired(input.subject, 'subject', 500);
    const preheader = this.optionalSingleLine(input.preheader, 'preheader', 255);
    const bodyHtml = this.sanitizedHtml(input.bodyHtml);
    const bodyText = this.optional(input.bodyText, 'bodyText', 1_000_000, false);
    return {
      name, subject, preheader, bodyHtml, bodyText,
    variables: extractEmailTemplateVariables(subject, preheader, bodyHtml, bodyText),
      category: this.category(input.category), isActive: input.isActive,
    };
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

  private sanitizedHtml(value: string): string {
    const required = this.required(value, 'bodyHtml', 1_000_000, false);
    const sanitized = sanitizeEmailTemplateHtml(required);
    if (sanitized.trim().length === 0) {
      throw itemizeGraphqlError('bodyHtml must contain supported email content', 'BAD_USER_INPUT', {
        field: 'bodyHtml', reason: 'INVALID_EMAIL_TEMPLATE_BODYHTML',
      });
    }
    return sanitized;
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

  private singleLineRequired(value: string, field: string, max: number): string {
    const normalized = this.required(value, field, max);
    if (/[\r\n]/.test(normalized)) {
      throw itemizeGraphqlError(`${field} must be a single line`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_EMAIL_TEMPLATE_${field.toUpperCase()}`,
      });
    }
    return normalized;
  }

  private optionalSingleLine(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    const normalized = this.optional(value, field, max);
    if (normalized && /[\r\n]/.test(normalized)) {
      throw itemizeGraphqlError(`${field} must be a single line`, 'BAD_USER_INPUT', {
        field, reason: `INVALID_EMAIL_TEMPLATE_${field.toUpperCase()}`,
      });
    }
    return normalized;
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
    preheader: row.preheader ?? null,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variables: this.variables(row.variables),
    category: row.category,
    isActive: row.is_active,
    createdById: row.created_by === null ? null : Number(row.created_by),
    createdByName: row.created_by_name ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    draftVersion: row.draft_version === undefined || row.draft_version === null
      ? null : Number(row.draft_version),
    publishedVersion: row.published_version === undefined || row.published_version === null
      ? null : Number(row.published_version),
    draftSubject: row.draft_subject ?? null,
    draftPreheader: row.draft_preheader ?? null,
    draftBodyHtml: row.draft_body_html ?? null,
    draftBodyText: row.draft_body_text ?? null,
    draftUpdatedAt: row.draft_updated_at ? new Date(row.draft_updated_at) : null,
    draftIsActive: row.draft_is_active ?? null,
    hasUnpublishedChanges: row.draft_version_id !== null,
  });
}
