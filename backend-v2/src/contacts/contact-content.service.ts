import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  ContactContentRepository,
  ContactContentRow,
} from './contact-content.repository';
import {
  ContactContent,
  ContactContentCollection,
  ContactContentItem,
} from './contact.types';

const CONTENT_LIMIT = 100;

@Injectable()
export class ContactContentService {
  constructor(private readonly content: ContactContentRepository) {}

  async get(organizationId: number, contactId: number): Promise<ContactContent> {
    if (!Number.isSafeInteger(contactId) || contactId < 1) {
      throw itemizeGraphqlError(
        'Contact ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'contactId' },
      );
    }

    try {
      const result = await this.content.find(organizationId, contactId, CONTENT_LIMIT);
      if (!result) throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      return {
        lists: this.collection(result.lists),
        notes: this.collection(result.notes),
        whiteboards: this.collection(result.whiteboards),
      };
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw itemizeGraphqlError(
        'Contact content service is unavailable',
        'SERVICE_UNAVAILABLE',
      );
    }
  }

  private collection(rows: ContactContentRow[]): ContactContentCollection {
    const total = rows[0]?.total ?? 0;
    return {
      nodes: rows.map((row) => this.map(row)),
      total,
      hasMore: total > rows.length,
    };
  }

  private map(row: ContactContentRow): ContactContentItem {
    return {
      id: Number(row.id),
      title: row.title,
      category: row.category,
      createdAt: new Date(row.created_at),
    };
  }
}
