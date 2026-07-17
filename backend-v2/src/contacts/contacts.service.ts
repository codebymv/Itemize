import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { NormalizedPage, PageInput, pageInfo } from '../common/pagination';
import { ContactSortField, SortDirection } from './contact.enums';
import {
  BulkUpdateContactsInput,
  ContactFilterInput,
  ContactSortInput,
  CreateContactInput,
  UpdateContactInput,
} from './contact.inputs';
import { BulkContactMutationResult, Contact, ContactPage } from './contact.types';
import {
  BulkContactUpdateValues,
  ContactCreateValues,
  ContactRow,
  ContactsRepository,
  ContactUpdateValues,
} from './contacts.repository';

const MAX_BULK_CONTACTS = 100;

@Injectable()
export class ContactsService {
  constructor(private readonly contacts: ContactsRepository) {}

  async list(
    organizationId: number,
    filter: ContactFilterInput = {},
    page: PageInput = new PageInput(),
    sort: ContactSortInput = new ContactSortInput(),
  ): Promise<ContactPage> {
    const normalizedPage = this.normalizePage(page);
    const normalizedFilter = this.normalizeFilter(filter);

    try {
      const result = await this.contacts.findPage({
        organizationId,
        ...normalizedFilter,
        sortField: sort.field ?? ContactSortField.CREATED_AT,
        sortDirection: sort.direction ?? SortDirection.DESC,
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.mapContact(row)),
        pageInfo: pageInfo(
          normalizedPage.page,
          normalizedPage.pageSize,
          result.total,
        ),
      };
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async get(organizationId: number, contactId: number): Promise<Contact> {
    if (!Number.isSafeInteger(contactId) || contactId < 1) {
      throw itemizeGraphqlError(
        'Contact ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_CONTACT_ID' },
      );
    }

    try {
      const row = await this.contacts.findById(organizationId, contactId);
      if (!row) {
        throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      }
      return this.mapContact(row);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      this.rethrowDatabaseError(error);
    }
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateContactInput,
  ): Promise<Contact> {
    const values = this.normalizeCreate(input);
    try {
      const outcome = await this.contacts.create(organizationId, userId, values);
      if (outcome.kind === 'invalid_assignee') {
        throw itemizeGraphqlError(
          'assignedToId must be a member of the active organization',
          'BAD_USER_INPUT',
          { field: 'assignedToId', reason: 'INVALID_ASSIGNEE' },
        );
      }
      if (outcome.kind === 'limit') {
        throw itemizeGraphqlError('Contact limit reached', 'FORBIDDEN', {
          reason: 'PLAN_LIMIT_REACHED',
          current: outcome.current,
          limit: outcome.limit,
          plan: outcome.plan,
        });
      }
      return this.mapContact(outcome.row);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      this.rethrowDatabaseError(error);
    }
  }

  async update(
    organizationId: number,
    userId: number,
    contactId: number,
    input: UpdateContactInput,
  ): Promise<Contact> {
    this.validateContactId(contactId);
    const values = this.normalizeUpdate(input);
    try {
      const outcome = await this.contacts.update(
        organizationId,
        userId,
        contactId,
        values,
      );
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'invalid_assignee') {
        throw itemizeGraphqlError(
          'assignedToId must be a member of the active organization',
          'BAD_USER_INPUT',
          { field: 'assignedToId', reason: 'INVALID_ASSIGNEE' },
        );
      }
      return this.mapContact(outcome.row);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      this.rethrowDatabaseError(error);
    }
  }

  async delete(organizationId: number, contactId: number): Promise<number> {
    this.validateContactId(contactId);
    try {
      if (!(await this.contacts.delete(organizationId, contactId))) {
        throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      }
      return contactId;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      this.rethrowDatabaseError(error);
    }
  }

  async bulkUpdate(
    organizationId: number,
    userId: number,
    input: BulkUpdateContactsInput,
  ): Promise<BulkContactMutationResult> {
    const requestedIds = this.normalizeBulkIds(input.contactIds);
    const values = this.normalizeBulkUpdate(input);
    try {
      const outcome = await this.contacts.bulkUpdate(
        organizationId,
        userId,
        requestedIds,
        values,
      );
      if (outcome.kind === 'invalid_assignee') {
        throw itemizeGraphqlError(
          'assignedToId must be a member of the active organization',
          'BAD_USER_INPUT',
          { field: 'assignedToId', reason: 'INVALID_ASSIGNEE' },
        );
      }
      const matched = new Set(outcome.matchedIds);
      return {
        requestedIds,
        matchedIds: outcome.matchedIds,
        changedIds: outcome.changedIds,
        rejectedIds: requestedIds.filter((id) => !matched.has(id)),
      };
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      this.rethrowDatabaseError(error);
    }
  }

  async bulkDelete(
    organizationId: number,
    contactIds: number[],
  ): Promise<BulkContactMutationResult> {
    const requestedIds = this.normalizeBulkIds(contactIds);
    try {
      const deletedIds = await this.contacts.bulkDelete(
        organizationId,
        requestedIds,
      );
      const deleted = new Set(deletedIds);
      return {
        requestedIds,
        matchedIds: deletedIds,
        changedIds: deletedIds,
        rejectedIds: requestedIds.filter((id) => !deleted.has(id)),
      };
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  private normalizePage(page: PageInput): NormalizedPage {
    const pageNumber = page.page ?? 1;
    const pageSize = page.pageSize ?? 50;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw itemizeGraphqlError('page must be at least 1', 'BAD_USER_INPUT', {
        field: 'page',
      });
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
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

  private normalizeFilter(filter: ContactFilterInput): ContactFilterInput {
    const search = filter.search?.trim();
    if (search && search.length > 200) {
      throw itemizeGraphqlError(
        'search must not exceed 200 characters',
        'BAD_USER_INPUT',
        { field: 'search' },
      );
    }
    if (
      filter.assignedToId !== undefined &&
      (!Number.isSafeInteger(filter.assignedToId) || filter.assignedToId < 1)
    ) {
      throw itemizeGraphqlError(
        'assignedToId must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'assignedToId' },
      );
    }

    const tags = filter.tags
      ? [...new Set(filter.tags.map((tag) => tag.trim()))]
      : undefined;
    if (
      tags &&
      (tags.length > 50 || tags.some((tag) => tag.length < 1 || tag.length > 50))
    ) {
      throw itemizeGraphqlError(
        'tags must contain 1-50 non-empty values of at most 50 characters',
        'BAD_USER_INPUT',
        { field: 'tags' },
      );
    }

    return {
      ...(search ? { search } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(filter.assignedToId !== undefined
        ? { assignedToId: filter.assignedToId }
        : {}),
    };
  }

  private normalizeCreate(input: CreateContactInput): ContactCreateValues {
    const values: ContactCreateValues = {
      firstName: this.optionalString(input.firstName, 'firstName', 100),
      lastName: this.optionalString(input.lastName, 'lastName', 100),
      email: this.optionalEmail(input.email),
      phone: this.optionalPhone(input.phone),
      company: this.optionalString(input.company, 'company', 200),
      jobTitle: this.optionalString(input.jobTitle, 'jobTitle', 100),
      address: this.record(input.address, 'address'),
      source: input.source ?? 'manual',
      status: input.status ?? 'active',
      customFields: this.record(input.customFields, 'customFields'),
      tags: this.normalizeTags(input.tags),
      assignedToId: this.optionalId(input.assignedToId, 'assignedToId'),
    };
    if (!values.firstName && !values.lastName && !values.email && !values.company) {
      throw itemizeGraphqlError(
        'At least one of firstName, lastName, email, or company is required',
        'BAD_USER_INPUT',
        { reason: 'CONTACT_IDENTITY_REQUIRED' },
      );
    }
    return values;
  }

  private normalizeUpdate(input: UpdateContactInput): ContactUpdateValues {
    const values: ContactUpdateValues = {};
    const has = (field: keyof UpdateContactInput): boolean =>
      Object.prototype.hasOwnProperty.call(input, field);
    const stringFields: Array<[
      keyof Pick<UpdateContactInput, 'firstName' | 'lastName' | 'company' | 'jobTitle'>,
      number,
    ]> = [
      ['firstName', 100],
      ['lastName', 100],
      ['company', 200],
      ['jobTitle', 100],
    ];
    for (const [field, max] of stringFields) {
      if (has(field)) values[field] = this.nullableString(input[field], field, max);
    }
    if (has('email')) values.email = input.email === null ? null : this.optionalEmail(input.email);
    if (has('phone')) values.phone = input.phone === null ? null : this.optionalPhone(input.phone);
    if (has('address')) values.address = this.record(input.address, 'address');
    if (has('customFields')) values.customFields = this.record(input.customFields, 'customFields');
    if (has('tags')) values.tags = this.normalizeTags(input.tags ?? undefined);
    if (has('assignedToId')) {
      values.assignedToId = input.assignedToId === null
        ? null
        : this.optionalId(input.assignedToId, 'assignedToId');
    }
    if (has('source')) {
      if (input.source === null) this.nonNullUpdate('source');
      values.source = input.source;
    }
    if (has('status')) {
      if (input.status === null) this.nonNullUpdate('status');
      values.status = input.status;
    }
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError('At least one update field is required', 'BAD_USER_INPUT', {
        reason: 'EMPTY_UPDATE',
      });
    }
    return values;
  }

  private normalizeBulkIds(contactIds: number[]): number[] {
    if (!Array.isArray(contactIds) || contactIds.length < 1) {
      throw itemizeGraphqlError(
        'contactIds must contain at least one ID',
        'BAD_USER_INPUT',
        { field: 'contactIds', reason: 'EMPTY_BULK_IDS' },
      );
    }
    if (contactIds.length > MAX_BULK_CONTACTS) {
      throw itemizeGraphqlError(
        `contactIds must contain at most ${MAX_BULK_CONTACTS} IDs`,
        'BAD_USER_INPUT',
        { field: 'contactIds', reason: 'BULK_LIMIT_EXCEEDED', limit: MAX_BULK_CONTACTS },
      );
    }
    if (contactIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw itemizeGraphqlError(
        'contactIds must contain only positive integers',
        'BAD_USER_INPUT',
        { field: 'contactIds', reason: 'INVALID_CONTACT_ID' },
      );
    }
    return [...new Set(contactIds)];
  }

  private normalizeBulkUpdate(input: BulkUpdateContactsInput): BulkContactUpdateValues {
    const updates = input.updates ?? {};
    const has = (field: keyof typeof updates): boolean =>
      Object.prototype.hasOwnProperty.call(updates, field);
    if (has('tagsMode') && !has('tags')) {
      throw itemizeGraphqlError(
        'tagsMode requires tags',
        'BAD_USER_INPUT',
        { field: 'tagsMode', reason: 'TAGS_REQUIRED' },
      );
    }
    if (has('status') && updates.status === null) this.nonNullUpdate('status');
    if (has('tags') && updates.tags === null) this.nonNullUpdate('tags');
    if (has('tagsMode') && updates.tagsMode === null) this.nonNullUpdate('tagsMode');
    const values: BulkContactUpdateValues = {
      ...(has('status') ? { status: updates.status! } : {}),
      ...(has('assignedToId')
        ? {
            assignedToId: updates.assignedToId === null
              ? null
              : this.optionalId(updates.assignedToId, 'assignedToId'),
          }
        : {}),
      ...(has('tags') ? { tags: this.normalizeTags(updates.tags!) } : {}),
      ...(has('tagsMode') ? { tagsMode: updates.tagsMode! } : {}),
    };
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError(
        'At least one bulk update field is required',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_UPDATE' },
      );
    }
    return values;
  }

  private validateContactId(contactId: number): void {
    if (!Number.isSafeInteger(contactId) || contactId < 1) {
      throw itemizeGraphqlError(
        'Contact ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_CONTACT_ID' },
      );
    }
  }

  private optionalString(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    if (normalized.length > max) {
      throw itemizeGraphqlError(`${field} must not exceed ${max} characters`, 'BAD_USER_INPUT', { field });
    }
    return normalized || null;
  }

  private nullableString(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    return this.optionalString(value, field, max);
  }

  private optionalEmail(value: string | null | undefined): string | null {
    const normalized = this.optionalString(value, 'email', 255);
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw itemizeGraphqlError('Invalid email format', 'BAD_USER_INPUT', { field: 'email' });
    }
    return normalized?.toLowerCase() ?? null;
  }

  private optionalPhone(value: string | null | undefined): string | null {
    const normalized = this.optionalString(value, 'phone', 50);
    if (normalized && (!/^[+()\-.\s\d]+$/.test(normalized) || !/\d/.test(normalized))) {
      throw itemizeGraphqlError('Invalid phone number', 'BAD_USER_INPUT', { field: 'phone' });
    }
    return normalized;
  }

  private optionalId(value: number | undefined, field: string): number | null {
    if (value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', { field });
    }
    return value;
  }

  private record(
    value: Record<string, unknown> | null | undefined,
    field: string,
  ): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (Array.isArray(value) || typeof value !== 'object') {
      throw itemizeGraphqlError(`${field} must be an object`, 'BAD_USER_INPUT', { field });
    }
    return value;
  }

  private normalizeTags(tags: string[] | undefined): string[] {
    if (!tags) return [];
    const normalized = [...new Set(tags.map((tag) => tag.trim()))];
    if (
      normalized.length > 50 ||
      normalized.some((tag) => tag.length < 1 || tag.length > 50)
    ) {
      throw itemizeGraphqlError(
        'tags must contain at most 50 non-empty values of at most 50 characters',
        'BAD_USER_INPUT',
        { field: 'tags' },
      );
    }
    return normalized;
  }

  private nonNullUpdate(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', { field });
  }

  private mapContact(row: ContactRow): Contact {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      jobTitle: row.job_title,
      address: row.address ?? {},
      source: row.source as Contact['source'],
      status: row.status as Contact['status'],
      customFields: row.custom_fields ?? {},
      tags: row.tags ?? [],
      assignedToId: row.assigned_to === null ? null : Number(row.assigned_to),
      assignedToName: row.assigned_to_name,
      assignedToEmail: row.assigned_to_email,
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdByName: row.created_by_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(
      'Contact service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
