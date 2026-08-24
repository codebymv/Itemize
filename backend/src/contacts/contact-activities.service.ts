import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  ContactActivityFilterInput,
  CreateContactActivityInput,
} from './contact.inputs';
import { ContactActivity, ContactActivityPage } from './contact.types';
import {
  ContactActivitiesRepository,
  ContactActivityRow,
} from './contact-activities.repository';

@Injectable()
export class ContactActivitiesService {
  constructor(private readonly activities: ContactActivitiesRepository) {}

  async list(
    organizationId: number,
    contactId: number,
    filter: ContactActivityFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<ContactActivityPage> {
    this.validateContactId(contactId);
    const normalizedPage = this.normalizePage(page);
    try {
      const result = await this.activities.findPage({
        organizationId,
        contactId,
        ...(filter.type ? { type: filter.type } : {}),
        pageSize: normalizedPage.pageSize,
        offset: normalizedPage.offset,
      });
      if (!result) throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      return {
        nodes: result.rows.map((row) => this.map(row)),
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

  async create(
    organizationId: number,
    userId: number,
    contactId: number,
    input: CreateContactActivityInput,
  ): Promise<ContactActivity> {
    this.validateContactId(contactId);
    const title = this.optionalTitle(input.title);
    const content = this.record(input.content, 'content');
    const metadata = this.record(input.metadata, 'metadata');
    try {
      const row = await this.activities.create(
        organizationId,
        contactId,
        userId,
        { type: input.type, title, content, metadata },
      );
      if (!row) throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      return this.map(row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private validateContactId(contactId: number): void {
    if (!Number.isSafeInteger(contactId) || contactId < 1) {
      throw itemizeGraphqlError(
        'Contact ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'contactId' },
      );
    }
  }

  private normalizePage(page: PageInput): { page: number; pageSize: number; offset: number } {
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

  private optionalTitle(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value.trim() === '') return null;
    const title = value.trim();
    if (title.length > 255) {
      throw itemizeGraphqlError(
        'title must not exceed 255 characters',
        'BAD_USER_INPUT',
        { field: 'title' },
      );
    }
    return title;
  }

  private record(
    value: Record<string, unknown> | null | undefined,
    field: string,
  ): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (Array.isArray(value) || typeof value !== 'object') {
      throw itemizeGraphqlError(
        `${field} must be a JSON object`,
        'BAD_USER_INPUT',
        { field },
      );
    }
    return value;
  }

  private map(row: ContactActivityRow): ContactActivity {
    return {
      id: Number(row.id),
      contactId: Number(row.contact_id),
      userId: row.user_id === null ? null : Number(row.user_id),
      userName: row.user_name,
      userEmail: row.user_email,
      type: row.type,
      title: row.title,
      content: row.content ?? {},
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(
      'Contact activity service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
