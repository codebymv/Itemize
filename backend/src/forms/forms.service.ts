import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  normalizeNotificationEmails,
  normalizeRedirectUrl,
  validateFormFields,
} from './form.contract';
import { CreateFormInput, FormFieldInput, FormFilterInput, UpdateFormInput } from './form.inputs';
import { formCreationFingerprint } from './form-creation.idempotency';
import { Form, FormField, FormPage, FormSubmission, FormSubmissionPage } from './form.types';
import {
  FormFieldRow,
  FormFieldValue,
  FormLimit,
  FormRow,
  FormSubmissionRow,
  FormsRepository,
  FormWithFields,
  UpdateFormValues,
} from './forms.repository';

const FORM_TYPES = new Set(['form', 'survey', 'quiz']);
const FORM_STATUSES = new Set(['draft', 'published', 'archived']);

@Injectable()
export class FormsService {
  constructor(private readonly forms: FormsRepository) {}

  async list(organizationId: number, status?: string): Promise<Form[]> {
    const normalizedStatus = !status || status === 'all' ? undefined : this.status(status);
    return (await this.forms.findAll(organizationId, normalizedStatus)).map(
      (value) => this.mapValue(value),
    );
  }

  async listPage(
    organizationId: number,
    filter: FormFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<FormPage> {
    const normalizedPage = this.page(page);
    const status = !filter.status || filter.status === 'all'
      ? undefined
      : this.status(filter.status);
    const search = filter.search === undefined
      ? undefined
      : this.text(filter.search, 'search', 100);
    const searchPattern = search === undefined
      ? undefined
      : `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.forms.findPage({
      organizationId,
      ...(status === undefined ? {} : { status }),
      ...(searchPattern === undefined ? {} : { searchPattern }),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    return {
      nodes: result.rows.map((form) => this.mapValue({ form, fields: [] })),
      pageInfo: pageInfo(
        normalizedPage.page,
        normalizedPage.pageSize,
        result.total,
      ),
      stats: result.stats,
    };
  }

  async get(organizationId: number, formId: number): Promise<Form> {
    this.id(formId, 'id');
    const value = await this.forms.findById(organizationId, formId);
    if (!value) throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    return this.mapValue(value);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateFormInput,
    idempotencyKey: string,
  ): Promise<Form> {
    const suppliedFields = input.fields ?? [];
    if (suppliedFields.some((field) => (field.conditions?.length ?? 0) > 0)) {
      throw itemizeGraphqlError(
        'Create the form before configuring conditions',
        'BAD_USER_INPUT',
        { field: 'fields', reason: 'INVALID_FORM_CONFIGURATION' },
      );
    }
    const fields =
      suppliedFields.length > 0
        ? this.fields(suppliedFields, true)
        : this.defaultFields();
    const values = {
      name: this.text(input.name, 'name', 255),
      description: this.nullableText(input.description, 'description', 10000),
      slug: this.slug(input.name),
      type: this.type(input.type ?? 'form'),
      submitButtonText: this.text(
        input.submitButtonText ?? 'Submit',
        'submitButtonText',
        100,
      ),
      successMessage: this.text(
        input.successMessage ?? 'Thank you for your submission!',
        'successMessage',
        10000,
      ),
      redirectUrl: normalizeRedirectUrl(input.redirectUrl),
      notifyOnSubmit: input.notifyOnSubmit ?? true,
      notificationEmails: normalizeNotificationEmails(input.notificationEmails),
      theme: this.record(input.theme ?? { primaryColor: '#3B82F6' }, 'theme'),
      createContact: input.createContact ?? true,
      contactTags: this.tags(input.contactTags ?? []),
      fields,
    };
    const { slug: _generatedSlug, ...fingerprintValues } = values;
    const outcome = await this.forms.create(
      organizationId,
      userId,
      values,
      this.idempotencyKey(idempotencyKey),
      formCreationFingerprint('create', fingerprintValues),
    );
    if (outcome.kind === 'limit') {
      this.planLimit(outcome.limit);
    }
    if (outcome.kind !== 'created') this.creationFailure(outcome.kind);
    return this.mapValue(outcome.value);
  }

  async update(
    organizationId: number,
    formId: number,
    input: UpdateFormInput,
  ): Promise<Form> {
    this.id(formId, 'id');
    for (const key of [
      'name',
      'type',
      'status',
      'submitButtonText',
      'successMessage',
      'notifyOnSubmit',
      'theme',
      'createContact',
    ] as const) {
      if (input[key] === null) {
        throw itemizeGraphqlError(`${key} cannot be null`, 'BAD_USER_INPUT', {
          field: key,
          reason: 'NULL_FORM_FIELD',
        });
      }
    }
    const values: UpdateFormValues = {
      ...(input.name !== undefined
        ? { name: this.text(input.name as string, 'name', 255) }
        : {}),
      ...(input.description !== undefined
        ? { description: this.nullableText(input.description, 'description', 10000) }
        : {}),
      ...(input.type !== undefined ? { type: this.type(input.type as string) } : {}),
      ...(input.status !== undefined
        ? { status: this.status(input.status as string) }
        : {}),
      ...(input.submitButtonText !== undefined
        ? {
            submitButtonText: this.text(
              input.submitButtonText as string,
              'submitButtonText',
              100,
            ),
          }
        : {}),
      ...(input.successMessage !== undefined
        ? {
            successMessage: this.text(
              input.successMessage as string,
              'successMessage',
              10000,
            ),
          }
        : {}),
      ...(input.redirectUrl !== undefined
        ? { redirectUrl: normalizeRedirectUrl(input.redirectUrl) }
        : {}),
      ...(input.notifyOnSubmit !== undefined
        ? { notifyOnSubmit: input.notifyOnSubmit as boolean }
        : {}),
      ...(input.notificationEmails !== undefined
        ? {
            notificationEmails: normalizeNotificationEmails(
              input.notificationEmails,
            ),
          }
        : {}),
      ...(input.theme !== undefined
        ? { theme: this.record(input.theme, 'theme') }
        : {}),
      ...(input.createContact !== undefined
        ? { createContact: input.createContact as boolean }
        : {}),
      ...(input.contactTags !== undefined
        ? { contactTags: this.tags(input.contactTags ?? []) }
        : {}),
    };
    try {
      const value = await this.forms.update(
        organizationId,
        formId,
        values,
        (rows) => validateFormFields(rows.map(this.rowToInput), true),
      );
      if (!value) throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
      return this.mapValue(value);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(organizationId: number, formId: number): Promise<number> {
    this.id(formId, 'id');
    if (!(await this.forms.delete(organizationId, formId))) {
      throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    }
    return formId;
  }

  async duplicate(
    organizationId: number,
    userId: number,
    formId: number,
    idempotencyKey: string,
  ): Promise<Form> {
    this.id(formId, 'id');
    const outcome = await this.forms.duplicate(
      organizationId,
      userId,
      formId,
      this.slug('form-copy'),
      this.idempotencyKey(idempotencyKey),
      formCreationFingerprint('duplicate', { sourceFormId: formId }),
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'limit') this.planLimit(outcome.limit);
    if (outcome.kind !== 'created') this.creationFailure(outcome.kind);
    return this.mapValue(outcome.value);
  }

  async replaceFields(
    organizationId: number,
    formId: number,
    input: FormFieldInput[],
  ): Promise<FormField[]> {
    this.id(formId, 'id');
    if (!Array.isArray(input) || input.length > 100) {
      throw itemizeGraphqlError(
        'fields must be an array of at most 100 fields',
        'BAD_USER_INPUT',
        { field: 'fields', reason: 'INVALID_FORM_CONFIGURATION' },
      );
    }
    if (input.length > 0) validateFormFields(input, true);
    const rows = await this.forms.replaceFields(
      organizationId,
      formId,
      this.fields(input, false),
      (status) => {
        if (status === 'published') validateFormFields(input, true);
      },
    );
    if (!rows) throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    return rows.map(this.mapField);
  }

  async submissions(
    organizationId: number,
    formId: number,
    page = 1,
    limit = 50,
  ): Promise<FormSubmissionPage> {
    this.id(formId, 'formId');
    if (!Number.isSafeInteger(page) || page < 1) {
      throw itemizeGraphqlError('page must be a positive integer', 'BAD_USER_INPUT', {
        field: 'page',
        reason: 'INVALID_PAGE',
      });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw itemizeGraphqlError('limit must be between 1 and 100', 'BAD_USER_INPUT', {
        field: 'limit',
        reason: 'INVALID_LIMIT',
      });
    }
    const result = await this.forms.listSubmissions(
      organizationId,
      formId,
      page,
      limit,
    );
    if (!result) throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    return {
      submissions: result.submissions.map(this.mapSubmission),
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async deleteSubmission(
    organizationId: number,
    formId: number,
    submissionId: number,
  ): Promise<number> {
    this.id(formId, 'formId');
    this.id(submissionId, 'submissionId');
    if (
      !(await this.forms.deleteSubmission(organizationId, formId, submissionId))
    ) {
      throw itemizeGraphqlError('Submission not found', 'NOT_FOUND');
    }
    return submissionId;
  }

  private fields(input: FormFieldInput[], validate: boolean): FormFieldValue[] {
    if (validate) validateFormFields(input, true);
    return input.map((field) => ({
      ...(field.id === undefined ? {} : { id: this.positiveId(field.id) }),
      fieldType: field.fieldType,
      label: field.label.trim(),
      placeholder: this.nullableText(field.placeholder, 'placeholder', 255),
      helpText: this.nullableText(field.helpText, 'helpText', 10000),
      isRequired: field.isRequired ?? false,
      validation: this.record(field.validation ?? {}, 'validation'),
      options: field.options ?? [],
      width: field.width ?? 'full',
      conditions: field.conditions ?? [],
      mapToContactField: field.mapToContactField?.trim() || null,
    }));
  }

  private defaultFields(): FormFieldValue[] {
    return [
      {
        fieldType: 'text',
        label: 'Name',
        placeholder: null,
        helpText: null,
        isRequired: true,
        validation: {},
        options: [],
        width: 'full',
        conditions: [],
        mapToContactField: 'first_name',
      },
      {
        fieldType: 'email',
        label: 'Email',
        placeholder: null,
        helpText: null,
        isRequired: true,
        validation: {},
        options: [],
        width: 'full',
        conditions: [],
        mapToContactField: 'email',
      },
    ];
  }

  private id(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_ID',
      });
    }
  }

  private positiveId(value: number): number {
    this.id(value, 'fields');
    return value;
  }

  private page(input: PageInput) {
    if (
      !Number.isInteger(input.page) || input.page < 1
      || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
    ) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page', reason: 'INVALID_PAGE',
      });
    }
    return {
      page: input.page,
      pageSize: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  private text(value: string, field: string, max: number): string {
    const normalized = value?.trim();
    if (!normalized || normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain between 1 and ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_FORM_FIELD' },
      );
    }
    return normalized;
  }

  private nullableText(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    if (normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must not exceed ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_FORM_FIELD' },
      );
    }
    return normalized || null;
  }

  private type(value: string): string {
    if (!FORM_TYPES.has(value)) {
      throw itemizeGraphqlError('Unsupported form type', 'BAD_USER_INPUT', {
        field: 'type',
        reason: 'INVALID_FORM_TYPE',
      });
    }
    return value;
  }

  private status(value: string): string {
    if (!FORM_STATUSES.has(value)) {
      throw itemizeGraphqlError('Unsupported form status', 'BAD_USER_INPUT', {
        field: 'status',
        reason: 'INVALID_FORM_STATUS',
      });
    }
    return value;
  }

  private tags(values: string[]): string[] {
    if (!Array.isArray(values) || values.length > 100) {
      throw itemizeGraphqlError('contactTags is invalid', 'BAD_USER_INPUT', {
        field: 'contactTags',
        reason: 'INVALID_CONTACT_TAGS',
      });
    }
    const tags = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (tags.some((tag) => tag.length > 100)) {
      throw itemizeGraphqlError('contactTags is invalid', 'BAD_USER_INPUT', {
        field: 'contactTags',
        reason: 'INVALID_CONTACT_TAGS',
      });
    }
    return tags;
  }

  private idempotencyKey(value: string): string {
    const key = String(value ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
      throw itemizeGraphqlError(
        'idempotencyKey must be 1-128 safe ASCII characters',
        'BAD_USER_INPUT',
        {
          field: 'idempotencyKey',
          reason: 'INVALID_IDEMPOTENCY_KEY',
        },
      );
    }
    return key;
  }

  private creationFailure(
    kind: 'not_found' | 'idempotency_conflict' | 'result_unavailable',
  ): never {
    if (kind === 'not_found') {
      throw itemizeGraphqlError('Form not found', 'NOT_FOUND');
    }
    if (kind === 'idempotency_conflict') {
      throw itemizeGraphqlError(
        'idempotencyKey was already used for a different form creation request',
        'CONFLICT',
        {
          field: 'idempotencyKey',
          reason: 'IDEMPOTENCY_KEY_REUSED',
        },
      );
    }
    throw itemizeGraphqlError(
      'The original form creation result is no longer available',
      'CONFLICT',
      { reason: 'IDEMPOTENT_RESULT_UNAVAILABLE' },
    );
  }

  private planLimit(limit: FormLimit): never {
    throw itemizeGraphqlError(
      `You've reached your form limit (${limit.current}/${limit.limit}). Please upgrade your plan.`,
      'FORBIDDEN',
      {
        reason: 'PLAN_LIMIT_REACHED',
        current: limit.current,
        limit: limit.limit,
        plan: limit.plan,
      },
    );
  }

  private record(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(`${field} must be an object`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_JSON_OBJECT',
      });
    }
    return value as Record<string, unknown>;
  }

  private slug(name: string): string {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'form';
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private mapValue(value: FormWithFields): Form {
    return this.mapForm(value.form, value.fields);
  }

  private mapForm(row: FormRow, fields: FormFieldRow[]): Form {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      name: row.name,
      description: row.description,
      slug: row.slug,
      publicId: row.public_id,
      type: row.type,
      status: row.status,
      submitButtonText: row.submit_button_text,
      successMessage: row.success_message,
      redirectUrl: row.redirect_url,
      notifyOnSubmit: row.notify_on_submit,
      notificationEmails: row.notification_emails ?? [],
      theme: row.theme ?? {},
      createContact: row.create_contact,
      contactTags: row.contact_tags ?? [],
      createdById: row.created_by === null ? null : Number(row.created_by),
      fields: fields.map(this.mapField),
      submissionCount: Number(row.submission_count),
      fieldCount: Number(row.field_count),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private readonly mapField = (row: FormFieldRow): FormField => ({
    id: Number(row.id),
    formId: Number(row.form_id),
    fieldType: row.field_type,
    label: row.label,
    placeholder: row.placeholder,
    helpText: row.help_text,
    isRequired: row.is_required,
    validation: row.validation ?? {},
    options: row.options ?? [],
    fieldOrder: Number(row.field_order),
    width: row.width,
    conditions: row.conditions ?? [],
    mapToContactField: row.map_to_contact_field,
    createdAt: new Date(row.created_at),
  });

  private readonly rowToInput = (row: FormFieldRow): FormFieldInput => ({
    id: Number(row.id),
    fieldType: row.field_type,
    label: row.label,
    placeholder: row.placeholder,
    helpText: row.help_text,
    isRequired: row.is_required,
    validation: row.validation ?? {},
    options: row.options ?? [],
    width: row.width,
    conditions: row.conditions ?? [],
    mapToContactField: row.map_to_contact_field,
  });

  private readonly mapSubmission = (row: FormSubmissionRow): FormSubmission => ({
    id: Number(row.id),
    formId: Number(row.form_id),
    organizationId: Number(row.organization_id),
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    data: row.data,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    referrer: row.referrer,
    score: row.score === null ? null : Number(row.score),
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactEmail: row.contact_email,
    createdAt: new Date(row.created_at),
  });

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw error;
  }
}
