import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { NormalizedPage, PageInput, pageInfo } from '../common/pagination';
import { ContactSortField, SortDirection } from './contact.enums';
import { ContactFilterInput, ContactSortInput } from './contact.inputs';
import { Contact, ContactPage } from './contact.types';
import { ContactRow, ContactsRepository } from './contacts.repository';

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
