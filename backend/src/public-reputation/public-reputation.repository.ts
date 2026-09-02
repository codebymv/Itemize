import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PublicReviewSubmission } from './public-review.idempotency';

export const REVIEW_PLATFORMS = new Set([
  'google',
  'facebook',
  'yelp',
  'trustpilot',
  'g2',
  'capterra',
  'custom',
]);

export type PublicReviewWidgetRow = {
  organization_id: number;
  widget_type: string;
  theme: string | null;
  primary_color: string | null;
  background_color: string | null;
  text_color: string | null;
  border_radius: number | null;
  show_rating_stars: boolean;
  show_reviewer_photo: boolean;
  show_review_date: boolean;
  show_platform_icon: boolean;
  min_rating: number | null;
  platforms: string[] | null;
  max_reviews: number | null;
  hide_no_text_reviews: boolean;
};

export type PublicReviewRow = {
  rating: number;
  review_text: string | null;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  platform: string;
  review_date: Date | null;
};

export type ReviewRequestRow = {
  id: number;
  organization_id: number;
  contact_id: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  preferred_platform: string | null;
  redirect_url: string | null;
  status?: string;
  expires_at?: Date | null;
  is_expired?: boolean;
  submission_fingerprint?: string | null;
  organization_name?: string;
};

export type SubmitReviewOutcome =
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'submitted'; request: ReviewRequestRow; replayed: boolean };

@Injectable()
export class PublicReputationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async publicWidget(widgetKey: string): Promise<{
    widget: PublicReviewWidgetRow;
    reviews: PublicReviewRow[];
  } | null> {
    const client = await this.pool.connect();
    try {
      const widgetResult = await client.query<PublicReviewWidgetRow>(
        `SELECT organization_id, widget_type, theme, primary_color,
                background_color, text_color, border_radius,
                show_rating_stars, show_reviewer_photo, show_review_date,
                show_platform_icon, min_rating, platforms, max_reviews,
                hide_no_text_reviews
         FROM review_widgets
         WHERE widget_key = $1 AND is_active = TRUE`,
        [widgetKey],
      );
      if (widgetResult.rows.length === 0) return null;
      const widget = widgetResult.rows[0];
      const minimumRating =
        Number.isInteger(widget.min_rating) &&
        (widget.min_rating as number) >= 1 &&
        (widget.min_rating as number) <= 5
          ? (widget.min_rating as number)
          : 4;
      const maximumReviews =
        Number.isInteger(widget.max_reviews) &&
        (widget.max_reviews as number) >= 1 &&
        (widget.max_reviews as number) <= 100
          ? (widget.max_reviews as number)
          : 10;
      const selectedPlatforms = Array.isArray(widget.platforms)
        ? widget.platforms
            .filter((platform) => REVIEW_PLATFORMS.has(platform))
            .slice(0, REVIEW_PLATFORMS.size)
        : [];

      const reviews = await client.query<PublicReviewRow>(
        `SELECT
           rating, review_text, reviewer_name, reviewer_avatar_url,
           platform, review_date
         FROM reviews
         WHERE organization_id = $1
           AND rating >= $2
           AND status IS DISTINCT FROM 'hidden'
           AND status IS DISTINCT FROM 'flagged'
           ${widget.hide_no_text_reviews ? "AND review_text IS NOT NULL AND review_text != ''" : ''}
           ${selectedPlatforms.length > 0 ? 'AND platform = ANY($4)' : ''}
         ORDER BY review_date DESC
         LIMIT $3`,
        selectedPlatforms.length > 0
          ? [widget.organization_id, minimumRating, maximumReviews, selectedPlatforms]
          : [widget.organization_id, minimumRating, maximumReviews],
      );
      return { widget, reviews: reviews.rows };
    } finally {
      client.release();
    }
  }

  async openReviewRequest(token: string): Promise<ReviewRequestRow | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ReviewRequestRow>(
        `SELECT rr.id, rr.organization_id, rr.contact_name,
                rr.preferred_platform, rr.redirect_url,
                o.name as organization_name
         FROM review_requests rr
         JOIN organizations o ON rr.organization_id = o.id
         WHERE rr.unique_token = $1
           AND rr.status NOT IN ('completed', 'unsubscribed')
           AND (rr.expires_at IS NULL OR rr.expires_at > CURRENT_TIMESTAMP)`,
        [token],
      );
      if (result.rows.length === 0) return null;
      const request = result.rows[0];
      await client.query(
        `UPDATE review_requests SET
           clicked = TRUE,
           clicked_at = COALESCE(clicked_at, CURRENT_TIMESTAMP),
           status = CASE WHEN status = 'sent' THEN 'clicked' ELSE status END
         WHERE id = $1`,
        [request.id],
      );
      return request;
    } finally {
      client.release();
    }
  }

  async submitReview(
    token: string,
    values: PublicReviewSubmission & { requestFingerprint: string },
  ): Promise<SubmitReviewOutcome> {
    return this.transaction(async (client) => {
      const requestResult = await client.query<ReviewRequestRow>(
        `SELECT id, organization_id, contact_id, contact_email, contact_phone,
                contact_name, preferred_platform, redirect_url, status,
                expires_at, submission_fingerprint,
                (expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP) AS is_expired
         FROM review_requests
         WHERE unique_token = $1
         FOR UPDATE`,
        [token],
      );
      if (requestResult.rows.length === 0) return { kind: 'not_found' };
      const request = requestResult.rows[0];
      if (request.status === 'completed') {
        return request.submission_fingerprint === values.requestFingerprint
          ? { kind: 'submitted', request, replayed: true }
          : { kind: 'conflict' };
      }
      if (
        request.status === 'unsubscribed'
        || request.is_expired === true
      ) {
        return { kind: 'not_found' };
      }

      const review = await client.query<{ id: number }>(
        `INSERT INTO reviews (
           organization_id, platform, rating, review_text,
           reviewer_name, reviewer_email, reviewer_phone, contact_id,
           sentiment, source, review_request_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'request', $10)
         RETURNING id`,
        [
          request.organization_id,
          values.platform || request.preferred_platform || 'custom',
          values.rating,
          values.reviewText,
          request.contact_name,
          request.contact_email,
          request.contact_phone,
          request.contact_id,
          values.sentiment,
          request.id,
        ],
      );
      await client.query(
        `UPDATE review_requests SET
           rating_given = $1,
           review_submitted = TRUE,
           review_submitted_at = CURRENT_TIMESTAMP,
           review_id = $2,
           submission_fingerprint = $4,
           status = 'completed'
         WHERE id = $3`,
        [values.rating, review.rows[0].id, request.id, values.requestFingerprint],
      );
      return { kind: 'submitted', request, replayed: false };
    });
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
