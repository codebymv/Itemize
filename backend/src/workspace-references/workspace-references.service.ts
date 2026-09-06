import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  collectMentionMarkup,
  collectMentionTokens,
  downgradeMentionMarkup,
  downgradeMentionTokens,
  uniqueReferences,
  type MentionToken,
  type ReferenceEntityType,
} from '../workspace-content/mention-tokens';
import {
  WorkspaceReferencesRepository,
  type ReferenceSource,
} from './workspace-references.repository';
import type {
  MoneyDocumentSuggestion,
  WorkspaceReference,
  WorkspaceReferenceSource,
} from './workspace-references.types';

const ENTITY_TYPES: readonly ReferenceEntityType[] = ['contact', 'invoice', 'estimate', 'payment'];
const SUGGESTION_LIMIT = 6;

export interface ListItemLike {
  text: string;
}

@Injectable()
export class WorkspaceReferencesService {
  constructor(private readonly repository: WorkspaceReferencesRepository) {}

  /**
   * Validates the references in a list's items inside the caller's save
   * transaction: unauthorized tokens become plain text, the surviving set is
   * stored for the card, and the (possibly rewritten) items are returned.
   */
  async commitListReferences<T extends ListItemLike>(
    client: PoolClient,
    userId: number,
    source: ReferenceSource,
    items: T[],
  ): Promise<T[]> {
    const tokens = items.flatMap((item) => collectMentionTokens(item.text));
    if (tokens.length === 0) {
      await this.repository.replaceForSource(client, userId, source, []);
      return items;
    }
    const allowed = await this.repository.allowedReferences(client, userId, tokens);
    const rewritten = items.map((item) => ({
      ...item,
      text: downgradeMentionTokens(item.text, allowed),
    }));
    await this.repository.replaceForSource(
      client,
      userId,
      source,
      uniqueReferences(rewritten.flatMap((item) => collectMentionTokens(item.text))),
    );
    return rewritten;
  }

  /** The same contract for a note's HTML, where references are mention nodes. */
  async commitNoteReferences(
    client: PoolClient,
    userId: number,
    source: ReferenceSource,
    html: string,
  ): Promise<string> {
    const tokens = collectMentionMarkup(html);
    if (tokens.length === 0) {
      await this.repository.replaceForSource(client, userId, source, []);
      return html;
    }
    const allowed = await this.repository.allowedReferences(client, userId, tokens);
    const rewritten = downgradeMentionMarkup(html, allowed);
    await this.repository.replaceForSource(
      client,
      userId,
      source,
      uniqueReferences(collectMentionMarkup(rewritten)),
    );
    return rewritten;
  }

  hydrate(userId: number, sources: ReferenceSource[]): Promise<Map<string, WorkspaceReference[]>> {
    return this.repository.hydrateForSources(userId, sources);
  }

  referencesTo(
    userId: number,
    entityType: string,
    entityId: number,
  ): Promise<WorkspaceReferenceSource[]> {
    return this.repository.referencesTo(userId, this.entityType(entityType), this.id(entityId));
  }

  suggestMoneyDocuments(
    organizationId: number,
    query: string | null | undefined,
    contactId: number | null | undefined,
  ): Promise<MoneyDocumentSuggestion[]> {
    const text = (query ?? '').trim();
    if (text.length > 100) {
      throw itemizeGraphqlError('Search text must not exceed 100 characters', 'BAD_USER_INPUT', {
        field: 'query',
        reason: 'INVALID_SEARCH',
      });
    }
    return this.repository.suggestMoneyDocuments(
      organizationId,
      text,
      contactId == null ? null : this.id(contactId),
      SUGGESTION_LIMIT,
    );
  }

  private entityType(value: string): ReferenceEntityType {
    if (!(ENTITY_TYPES as readonly string[]).includes(value)) {
      throw itemizeGraphqlError('Unknown reference entity type', 'BAD_USER_INPUT', {
        field: 'entityType',
        reason: 'INVALID_ENTITY_TYPE',
      });
    }
    return value as ReferenceEntityType;
  }

  private id(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError('Identifier must be a positive integer', 'BAD_USER_INPUT', {
        field: 'entityId',
        reason: 'INVALID_ID',
      });
    }
    return value;
  }
}

export type { MentionToken };
