import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { CreateSmsTemplateInput, SmsTemplateFilterInput, UpdateSmsTemplateInput } from './sms-template.inputs';
import { DeleteSmsTemplateResult, SmsMessageInfo, SmsTemplate, SmsTemplateCategory, SmsTemplatePage } from './sms-template.types';
import { extractSmsTemplateVariables, smsMessageInfo } from './sms-message-info';
import { SmsTemplateRow, SmsTemplatesRepository, SmsTemplateUpdates } from './sms-templates.repository';

@Injectable()
export class SmsTemplatesService {
  constructor(private readonly templates: SmsTemplatesRepository) {}

  async list(organizationId: number, filter: SmsTemplateFilterInput = {}, page: PageInput = new PageInput()): Promise<SmsTemplatePage> {
    const normalized = this.page(page);
    const result = await this.templates.findPage({ organizationId,
      ...(filter.category === undefined ? {} : { category: this.category(filter.category) }),
      ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      ...(filter.search === undefined ? {} : { searchPattern: this.search(filter.search) }),
      pageSize: normalized.pageSize, offset: normalized.offset });
    const total = this.count(result.total, 'smsTemplates.total');
    return { nodes: result.rows.map(this.map), pageInfo: pageInfo(normalized.page, normalized.pageSize, total) };
  }

  async detail(organizationId: number, id: number): Promise<SmsTemplate> {
    this.id(id); const row = await this.templates.findById(organizationId, id);
    if (!row) this.notFound(); return this.map(row);
  }

  async categories(organizationId: number): Promise<SmsTemplateCategory[]> {
    return (await this.templates.categories(organizationId)).map((row) => ({
      category: row.category, count: this.count(row.count, `smsTemplateCategories.${row.category}`),
    }));
  }

  messageInfo(message: string): SmsMessageInfo { return smsMessageInfo(this.required(message, 'message', 1600, false)); }

  async create(organizationId: number, userId: number, input: CreateSmsTemplateInput): Promise<SmsTemplate> {
    const name = this.required(input.name, 'name', 255);
    const message = this.required(input.message, 'message', 1600, false);
    return this.map(await this.templates.create(organizationId, userId, {
      name, message, variables: extractSmsTemplateVariables(message), category: this.category(input.category), isActive: input.isActive,
    }));
  }

  async update(organizationId: number, id: number, input: UpdateSmsTemplateInput): Promise<SmsTemplate> {
    this.id(id);
    for (const field of ['name', 'message', 'category', 'isActive'] as const) if (input[field] === null) this.nullField(field);
    const updates: SmsTemplateUpdates = {
      ...(input.name === undefined ? {} : { name: this.required(input.name as string, 'name', 255) }),
      ...(input.message === undefined ? {} : { message: this.required(input.message as string, 'message', 1600, false) }),
      ...(input.category === undefined ? {} : { category: this.category(input.category as string) }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive as boolean }),
    };
    const row = await this.templates.update(organizationId, id, updates);
    if (!row) this.notFound(); return this.map(row);
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<SmsTemplate> {
    this.id(id); const row = await this.templates.duplicate(organizationId, id, userId);
    if (!row) this.notFound(); return this.map(row);
  }

  async delete(organizationId: number, id: number): Promise<DeleteSmsTemplateResult> {
    this.id(id); if (!(await this.templates.delete(organizationId, id))) this.notFound();
    return { deletedId: id, success: true };
  }

  private page(input: PageInput) {
    if (!Number.isInteger(input.page) || input.page < 1 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100)
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', { field: 'page', reason: 'INVALID_PAGE' });
    return { page: input.page, pageSize: input.pageSize, offset: (input.page - 1) * input.pageSize };
  }
  private id(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT'); }
  private required(value: string, field: string, max: number, trim = true): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > max)
      throw itemizeGraphqlError(`${field} is required and must not exceed ${max} characters`, 'BAD_USER_INPUT', { field, reason: `INVALID_SMS_TEMPLATE_${field.toUpperCase()}` });
    return trim ? value.trim() : value;
  }
  private category(value: string) { return this.required(value, 'category', 100); }
  private search(value: string) {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) throw itemizeGraphqlError('search must be between 1 and 100 characters', 'BAD_USER_INPUT');
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }
  private count(value: unknown, field: string) {
    const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(`Unsafe SMS-template count at ${field}`); return parsed;
  }
  private variables(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private nullField(field: string): never { throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', { field, reason: 'NULL_SMS_TEMPLATE_FIELD' }); }
  private notFound(): never { throw itemizeGraphqlError('SMS template not found', 'NOT_FOUND'); }
  private readonly map = (row: SmsTemplateRow): SmsTemplate => ({
    id: Number(row.id), organizationId: Number(row.organization_id), name: row.name, message: row.message,
    variables: this.variables(row.variables), category: row.category, isActive: row.is_active,
    createdById: row.created_by === null ? null : Number(row.created_by), createdByName: row.created_by_name ?? null,
    messageInfo: smsMessageInfo(row.message), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  });
}
