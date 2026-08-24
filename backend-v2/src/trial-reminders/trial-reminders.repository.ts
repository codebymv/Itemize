import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type TrialReminderDeliveryClaim = {
  id: number;
  organization_id: number;
  organization_name: string | null;
  plan: string | null;
  trial_ends_at: Date;
  recipient_email: string | null;
  recipient_name: string | null;
  attempt_count: number;
  claimed_by: string;
};

export type TrialReminderFailureOutcome =
  | 'retry'
  | 'dead_letter'
  | 'stale';

const redact = (error: unknown): string =>
  String(error instanceof Error ? error.message : error || 'Trial reminder failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:sk|Bearer)\S+\b/gi, '[redacted-secret]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 2_000);

@Injectable()
export class TrialRemindersRepository {
  private readonly workerId = `backend-v2:${process.pid}:${randomUUID()}`;

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async enqueueEligible(windowStart: Date, windowEnd: Date): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO trial_reminder_deliveries (
         organization_id, trial_ends_at, organization_name, plan,
         recipient_email, recipient_name
       )
       SELECT
         organization.id,
         organization.trial_ends_at,
         organization.name,
         organization.plan,
         owner_user.email,
         owner_user.name
       FROM organizations organization
       LEFT JOIN LATERAL (
         SELECT users.email, users.name
         FROM organization_members member
         JOIN users ON users.id = member.user_id
         WHERE member.organization_id = organization.id
           AND member.role = 'owner'
         ORDER BY member.joined_at NULLS LAST, member.id
         LIMIT 1
       ) owner_user ON TRUE
       WHERE organization.subscription_status = 'trialing'
         AND organization.trial_ends_at >= $1
         AND organization.trial_ends_at <= $2
         AND NOT EXISTS (
           SELECT 1 FROM email_logs
           WHERE organization_id = organization.id
             AND metadata->>'email_type' = 'trial_reminder'
         )
       ON CONFLICT (organization_id, trial_ends_at) DO NOTHING
       RETURNING id`,
      [windowStart, windowEnd],
    );
    return result.rows.length;
  }

  async cancelIneligible(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE trial_reminder_deliveries delivery
       SET status = 'cancelled', lease_expires_at = NULL, claimed_by = NULL,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE delivery.status IN ('queued', 'retry')
         AND NOT EXISTS (
           SELECT 1 FROM organizations organization
           WHERE organization.id = delivery.organization_id
             AND organization.subscription_status = 'trialing'
             AND organization.trial_ends_at = delivery.trial_ends_at
             AND organization.trial_ends_at > CURRENT_TIMESTAMP
         )`,
    );
    return result.rowCount ?? 0;
  }

  async dueIds(limit: number): Promise<number[]> {
    const result = await this.pool.query<{ id: number }>(
      `SELECT id
       FROM trial_reminder_deliveries
       WHERE (status IN ('queued', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at, id
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => Number(row.id));
  }

  async claim(
    id: number,
    leaseSeconds: number,
  ): Promise<TrialReminderDeliveryClaim | null> {
    const result = await this.pool.query<TrialReminderDeliveryClaim>(
      `UPDATE trial_reminder_deliveries delivery
       SET status = 'processing', attempt_count = attempt_count + 1,
           lease_expires_at = CURRENT_TIMESTAMP + ($2::int * INTERVAL '1 second'),
           claimed_by = $3, last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE delivery.id = $1
         AND (
           (delivery.status IN ('queued', 'retry') AND delivery.next_attempt_at <= CURRENT_TIMESTAMP)
           OR (delivery.status = 'processing' AND delivery.lease_expires_at <= CURRENT_TIMESTAMP)
         )
         AND EXISTS (
           SELECT 1 FROM organizations organization
           WHERE organization.id = delivery.organization_id
             AND organization.subscription_status = 'trialing'
             AND organization.trial_ends_at = delivery.trial_ends_at
             AND organization.trial_ends_at > CURRENT_TIMESTAMP
         )
       RETURNING *`,
      [id, leaseSeconds, this.workerId],
    );
    return result.rows[0] ?? null;
  }

  async complete(
    claim: TrialReminderDeliveryClaim,
    providerId: string | null,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const completed = await client.query<{
        id: number;
        organization_id: number;
        recipient_email: string;
      }>(
        `UPDATE trial_reminder_deliveries
         SET status = 'sent', provider_id = $4,
             sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
             lease_expires_at = NULL, claimed_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'processing'
           AND attempt_count = $2 AND claimed_by = $3
         RETURNING id, organization_id, recipient_email`,
        [claim.id, claim.attempt_count, claim.claimed_by, providerId],
      );
      const delivery = completed.rows[0];
      if (!delivery) return false;

      const log = await client.query<{ id: number }>(
        `INSERT INTO email_logs (
           organization_id, to_email, subject, body_html, status,
           external_id, metadata, sent_at, queued_at
         ) VALUES ($1, $2, $3, '', 'sent', $4, $5::jsonb, NOW(), NOW())
         RETURNING id`,
        [
          delivery.organization_id,
          delivery.recipient_email,
          'Trial Email: trial_reminder',
          providerId,
          JSON.stringify({
            email_type: 'trial_reminder',
            trial_reminder_delivery_id: delivery.id,
          }),
        ],
      );
      await client.query(
        `UPDATE trial_reminder_deliveries
         SET email_log_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [delivery.id, log.rows[0].id],
      );
      return true;
    });
  }

  async fail(
    claim: TrialReminderDeliveryClaim,
    error: unknown,
    retryable: boolean,
    maxAttempts: number,
  ): Promise<TrialReminderFailureOutcome> {
    const terminal = !retryable || claim.attempt_count >= maxAttempts;
    const status = terminal ? 'dead_letter' : 'retry';
    const result = await this.pool.query<{ status: string }>(
      `UPDATE trial_reminder_deliveries
       SET status = $4::varchar,
           next_attempt_at = CASE WHEN $4::varchar = 'retry'
             THEN CURRENT_TIMESTAMP + (
               LEAST(3600, POWER(2, GREATEST(attempt_count - 1))) * INTERVAL '1 minute'
             )
             ELSE next_attempt_at
           END,
           lease_expires_at = NULL, claimed_by = NULL,
           last_error = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'processing'
         AND attempt_count = $2 AND claimed_by = $3
       RETURNING status`,
      [
        claim.id,
        claim.attempt_count,
        claim.claimed_by,
        status,
        redact(error),
      ],
    );
    return result.rows[0]
      ? (result.rows[0].status as TrialReminderFailureOutcome)
      : 'stale';
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
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
