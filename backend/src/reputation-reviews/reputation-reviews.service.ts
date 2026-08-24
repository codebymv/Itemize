import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateReputationReviewInput,
  ReputationReviewFilterInput,
  UpdateReputationReviewInput,
} from './reputation-review.inputs';
import { ReputationReview, ReputationReviewPage } from './reputation-review.types';
import {
  ReputationReviewCreateValues,
  ReputationReviewReferenceError,
  ReputationReviewRow,
  ReputationReviewsRepository,
  ReputationReviewUpdateValues,
} from './reputation-reviews.repository';

const PLATFORMS = new Set(['google', 'facebook', 'yelp', 'trustpilot', 'g2', 'capterra', 'custom']);
const STATUSES = new Set(['new', 'read', 'responded', 'flagged', 'hidden']);
const SENTIMENTS = new Set(['positive', 'neutral', 'negative']);

@Injectable()
export class ReputationReviewsService {
  constructor(private readonly repository: ReputationReviewsRepository) {}

  async list(
    organizationId: number,
    filter: ReputationReviewFilterInput = {},
    page?: PageInput,
  ): Promise<ReputationReviewPage> {
    const normalizedPage = this.normalizePage(page);
    const platform = this.optionalChoice(filter.platform, PLATFORMS, 'filter.platform', true);
    const status = this.optionalChoice(filter.status, STATUSES, 'filter.status', true);
    const sentiment = this.optionalChoice(filter.sentiment, SENTIMENTS, 'filter.sentiment', true);
    const search = filter.search?.trim();
    if (search && search.length > 200) this.badInput('search must be at most 200 characters', 'filter.search');
    if (filter.rating !== undefined && (!Number.isSafeInteger(filter.rating) || filter.rating < 1 || filter.rating > 5)) {
      this.badInput('rating must be an integer from 1 to 5', 'filter.rating');
    }
    try {
      const result = await this.repository.findPage({
        organizationId, ...(platform ? { platform } : {}),
        ...(filter.rating === undefined ? {} : { rating: filter.rating }),
        ...(status ? { status } : {}), ...(sentiment ? { sentiment } : {}),
        ...(search ? { search } : {}), pageSize: normalizedPage.pageSize, offset: normalizedPage.offset,
      });
      return {
        nodes: result.rows.map((row) => this.map(row)),
        pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, result.total),
      };
    } catch (error) { this.rethrow(error); }
  }

  async get(organizationId: number, reviewId: number): Promise<ReputationReview> {
    this.id(reviewId);
    try {
      const row = await this.repository.findById(organizationId, reviewId);
      if (!row) throw itemizeGraphqlError('Review not found', 'NOT_FOUND');
      return this.map(row);
    } catch (error) { this.rethrow(error); }
  }

  async create(organizationId: number, input: CreateReputationReviewInput): Promise<ReputationReview> {
    const values = this.createValues(input);
    try {
      return this.map(await this.repository.create(organizationId, values));
    } catch (error) { this.rethrow(error); }
  }

  async update(
    organizationId: number,
    userId: number,
    reviewId: number,
    input: UpdateReputationReviewInput,
  ): Promise<ReputationReview> {
    this.id(reviewId);
    if (!['status', 'responseText', 'internalNotes', 'contactId']
      .some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
      this.badInput('Review update must include at least one field', 'input');
    }
    try {
      const outcome = await this.repository.update(
        organizationId, reviewId, (current) => this.updateValues(current, userId, input),
      );
      if (outcome.kind === 'not_found') throw itemizeGraphqlError('Review not found', 'NOT_FOUND');
      return this.map(outcome.row);
    } catch (error) { this.rethrow(error); }
  }

  async delete(organizationId: number, reviewId: number): Promise<number> {
    this.id(reviewId);
    try {
      if (!(await this.repository.delete(organizationId, reviewId))) {
        throw itemizeGraphqlError('Review not found', 'NOT_FOUND');
      }
      return reviewId;
    } catch (error) { this.rethrow(error); }
  }

  private createValues(input: CreateReputationReviewInput): ReputationReviewCreateValues {
    if (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      this.badInput('rating must be an integer from 1 to 5', 'input.rating');
    }
    const platform = this.optionalChoice(input.platform ?? 'custom', PLATFORMS, 'input.platform')!;
    const platformId = this.nullableId(input.platformId, 'input.platformId');
    const contactId = this.nullableId(input.contactId, 'input.contactId');
    const reviewDate = input.reviewDate ?? new Date();
    if (!(reviewDate instanceof Date) || Number.isNaN(reviewDate.getTime())) {
      this.badInput('reviewDate must be a valid date', 'input.reviewDate');
    }
    return {
      platformId, platform, platformWasProvided: input.platform !== undefined, rating: input.rating,
      reviewText: this.nullableText(input.reviewText, 10000, 'input.reviewText'),
      reviewerName: this.nullableText(input.reviewerName, 255, 'input.reviewerName'),
      reviewerEmail: this.nullableText(input.reviewerEmail, 255, 'input.reviewerEmail'),
      reviewerPhone: this.nullableText(input.reviewerPhone, 50, 'input.reviewerPhone'),
      contactId, sentiment: input.rating >= 4 ? 'positive' : input.rating >= 3 ? 'neutral' : 'negative',
      reviewDate,
    };
  }

  private updateValues(
    current: ReputationReviewRow,
    userId: number,
    input: UpdateReputationReviewInput,
  ): ReputationReviewUpdateValues {
    let status = input.status === undefined
      ? current.status
      : this.optionalChoice(input.status, STATUSES, 'input.status')!;
    const hasResponse = Object.prototype.hasOwnProperty.call(input, 'responseText');
    const responseText = hasResponse
      ? this.nullableText(input.responseText, 10000, 'input.responseText')
      : current.response_text;
    let respondedAt = current.responded_at;
    let respondedBy = current.responded_by === null ? null : Number(current.responded_by);
    if (hasResponse && responseText) {
      if (input.status !== undefined && status !== 'responded') {
        this.badInput('A non-empty response requires responded status', 'input.status');
      }
      status = 'responded';
      respondedAt = new Date();
      respondedBy = userId;
    } else if (hasResponse && responseText === null) {
      if (status === 'responded' && input.status !== undefined) {
        this.badInput('responded status requires a non-empty response', 'input.status');
      }
      respondedAt = null;
      respondedBy = null;
      if (input.status === undefined && current.status === 'responded') status = 'read';
    } else if (status === 'responded' && !responseText) {
      this.badInput('responded status requires a non-empty response', 'input.status');
    }
    return {
      status, responseText, respondedAt, respondedBy,
      internalNotes: Object.prototype.hasOwnProperty.call(input, 'internalNotes')
        ? this.nullableText(input.internalNotes, 10000, 'input.internalNotes')
        : current.internal_notes,
      contactId: Object.prototype.hasOwnProperty.call(input, 'contactId')
        ? this.nullableId(input.contactId, 'input.contactId')
        : current.contact_id === null ? null : Number(current.contact_id),
    };
  }

  private normalizePage(page?: PageInput): { page: number; pageSize: number; offset: number } {
    const pageNumber = Number(page?.page ?? 1);
    const pageSize = Number(page?.pageSize ?? 20);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) this.badInput('page must be a positive integer', 'page.page');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      this.badInput('pageSize must be between 1 and 100', 'page.pageSize');
    }
    return { page: pageNumber, pageSize, offset: (pageNumber - 1) * pageSize };
  }

  private optionalChoice(
    value: string | undefined,
    allowed: Set<string>,
    field: string,
    allowAll = false,
  ): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (allowAll && normalized === 'all') return undefined;
    if (!allowed.has(normalized)) this.badInput(`${field.split('.').pop()} is invalid`, field);
    return normalized;
  }

  private nullableText(
    value: string | null | undefined,
    maximum: number,
    field: string,
  ): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    if (normalized.length > maximum) this.badInput(`${field.split('.').pop()} is too long`, field);
    return normalized || null;
  }

  private nullableId(value: number | null | undefined, field: string): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 1) this.badInput('ID must be a positive integer', field);
    return value;
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) this.badInput('Review ID must be a positive integer', 'id');
  }

  private map(row: ReputationReviewRow): ReputationReview {
    return {
      id: Number(row.id), organizationId: Number(row.organization_id),
      platformId: row.platform_id === null ? null : Number(row.platform_id), platform: row.platform,
      externalReviewId: row.external_review_id, rating: Number(row.rating), reviewText: row.review_text,
      reviewerName: row.reviewer_name, reviewerEmail: row.reviewer_email,
      reviewerPhone: row.reviewer_phone, reviewerAvatarUrl: row.reviewer_avatar_url,
      reviewerProfileUrl: row.reviewer_profile_url,
      contactId: row.contact_id === null ? null : Number(row.contact_id), status: row.status,
      responseText: row.response_text, respondedAt: row.responded_at ? new Date(row.responded_at) : null,
      respondedBy: row.responded_by === null ? null : Number(row.responded_by),
      internalNotes: row.internal_notes, sentiment: row.sentiment,
      sentimentScore: row.sentiment_score === null ? null : Number(row.sentiment_score),
      source: row.source, reviewRequestId: row.review_request_id === null ? null : Number(row.review_request_id),
      reviewDate: new Date(row.review_date), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
      platformName: row.platform_name, platformReviewUrl: row.platform_review_url,
      contactFirstName: row.contact_first_name, contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
    };
  }

  private badInput(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof ReputationReviewReferenceError) {
      throw itemizeGraphqlError(error.message, 'BAD_USER_INPUT', { field: `input.${error.field}` });
    }
    throw error;
  }
}
