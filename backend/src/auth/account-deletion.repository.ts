import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

type OwnedOrganizationRow = {
  id: number | string;
  name: string;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
};

type LockedUserRow = {
  id: number | string;
  email: string;
  name: string;
  password_hash: string | null;
  account_deletion_scheduled_at: Date | string | null;
};

export type AccountDeletionBlockerReason =
  | 'OWNERSHIP_TRANSFER_REQUIRED'
  | 'ACTIVE_SUBSCRIPTION'
  | 'SIGNATURE_EVIDENCE_RETAINED';

export type AccountDeletionBlocker = {
  reason: AccountDeletionBlockerReason;
  organizationId: number;
  organizationName: string;
};

export type AccountDeletionPreflightRecord = {
  eligible: boolean;
  membershipCount: number;
  ownedOrganizationCount: number;
  blockers: AccountDeletionBlocker[];
  scheduledAt: Date | null;
};

export type AccountDeletionOutcome =
  | { kind: 'scheduled'; scheduledAt: Date }
  | { kind: 'not_found' }
  | { kind: 'account_changed' }
  | { kind: 'blocked'; blockers: AccountDeletionBlocker[] };

export type RecoveredAccount = { id: number; email: string; name: string };

export type AccountDeletionPurgeResult =
  | { kind: 'deleted'; user: RecoveredAccount }
  | { kind: 'canceled'; user: RecoveredAccount; blockers: AccountDeletionBlocker[] };

@Injectable()
export class AccountDeletionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async preflight(userId: number): Promise<AccountDeletionPreflightRecord | null> {
    const client = await this.pool.connect();
    try {
      const user = await client.query<{
        account_deletion_scheduled_at: Date | string | null;
      }>(
        'SELECT account_deletion_scheduled_at FROM users WHERE id = $1',
        [userId],
      );
      if (!user.rows[0]) return null;
      const membership = await client.query<{ count: number | string }>(
        'SELECT COUNT(*)::integer AS count FROM organization_members WHERE user_id = $1',
        [userId],
      );
      const owned = await client.query<{ count: number | string }>(
        `SELECT COUNT(*)::integer AS count FROM organization_members
         WHERE user_id = $1 AND role = 'owner'`,
        [userId],
      );
      const blockers = await this.findBlockers(client, userId, false);
      const scheduledAt = user.rows[0].account_deletion_scheduled_at;
      return {
        eligible: blockers.length === 0,
        membershipCount: Number(membership.rows[0]?.count ?? 0),
        ownedOrganizationCount: Number(owned.rows[0]?.count ?? 0),
        blockers,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      };
    } finally {
      client.release();
    }
  }

  scheduleDeletion(input: {
    userId: number;
    expectedPasswordHash: string | null;
    tokenHash: string;
    emailHash: string;
    scheduledAt: Date;
  }): Promise<AccountDeletionOutcome> {
    return this.transaction(async (client) => {
      const user = await client.query<LockedUserRow>(
        `SELECT id, email, name, password_hash, account_deletion_scheduled_at
         FROM users WHERE id = $1 FOR UPDATE`,
        [input.userId],
      );
      if (!user.rows[0]) return { kind: 'not_found' };
      if (user.rows[0].password_hash !== input.expectedPasswordHash) {
        return { kind: 'account_changed' };
      }
      if (user.rows[0].account_deletion_scheduled_at) {
        const existingScheduledAt = new Date(user.rows[0].account_deletion_scheduled_at);
        await client.query(
          `UPDATE users
           SET account_deletion_token_hash = $2,
               account_deletion_token_expires_at = account_deletion_scheduled_at,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [input.userId, input.tokenHash],
        );
        return {
          kind: 'scheduled',
          scheduledAt: existingScheduledAt,
        };
      }

      const blockers = await this.findBlockers(client, input.userId, true);
      if (blockers.length > 0) return { kind: 'blocked', blockers };

      await client.query(
        `UPDATE users
         SET account_deletion_requested_at = CURRENT_TIMESTAMP,
             account_deletion_scheduled_at = $2,
             account_deletion_token_hash = $3,
             account_deletion_token_expires_at = $2,
             verification_token = NULL,
             verification_token_expires = NULL,
             password_reset_token = NULL,
             password_reset_expires = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [input.userId, input.scheduledAt, input.tokenHash],
      );
      await this.recordLifecycleEvent(client, {
        userId: input.userId,
        emailHash: input.emailHash,
        eventType: 'account.deletion_scheduled',
        metadata: { scheduledAt: input.scheduledAt.toISOString() },
      });
      return { kind: 'scheduled', scheduledAt: input.scheduledAt };
    });
  }

  cancelScheduleAfterDeliveryFailure(input: {
    userId: number;
    tokenHash: string;
    emailHash: string;
  }): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE users
         SET account_deletion_requested_at = NULL,
             account_deletion_scheduled_at = NULL,
             account_deletion_token_hash = NULL,
             account_deletion_token_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND account_deletion_token_hash = $2
         RETURNING id`,
        [input.userId, input.tokenHash],
      );
      if (result.rowCount !== 1) return false;
      await this.recordLifecycleEvent(client, {
        userId: input.userId,
        emailHash: input.emailHash,
        eventType: 'account.deletion_schedule_failed',
        metadata: { reason: 'RECOVERY_EMAIL_UNAVAILABLE' },
      });
      return true;
    });
  }

  recoverDeletion(tokenHash: string): Promise<RecoveredAccount | null> {
    return this.transaction(async (client) => {
      const result = await client.query<LockedUserRow>(
        `UPDATE users
         SET account_deletion_requested_at = NULL,
             account_deletion_scheduled_at = NULL,
             account_deletion_token_hash = NULL,
             account_deletion_token_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE account_deletion_token_hash = $1
           AND account_deletion_token_expires_at > CURRENT_TIMESTAMP
         RETURNING id, email, name, password_hash, account_deletion_scheduled_at`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      const user = { id: Number(row.id), email: row.email, name: row.name };
      await this.recordLifecycleEventFromEmail(
        client,
        user,
        'account.deletion_recovered',
        {},
      );
      return user;
    });
  }

  async purgeDue(limit = 25): Promise<AccountDeletionPurgeResult[]> {
    const results: AccountDeletionPurgeResult[] = [];
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    for (let index = 0; index < boundedLimit; index += 1) {
      const result = await this.transaction<AccountDeletionPurgeResult | null>(
        async (client) => {
          const selected = await client.query<LockedUserRow>(
            `SELECT id, email, name, password_hash, account_deletion_scheduled_at
             FROM users
             WHERE account_deletion_scheduled_at <= CURRENT_TIMESTAMP
             ORDER BY account_deletion_scheduled_at, id
             FOR UPDATE SKIP LOCKED
             LIMIT 1`,
          );
          const row = selected.rows[0];
          if (!row) return null;
          const user = { id: Number(row.id), email: row.email, name: row.name };
          const blockers = await this.findBlockers(client, user.id, true);
          if (blockers.length > 0) {
            await client.query(
              `UPDATE users
               SET account_deletion_requested_at = NULL,
                   account_deletion_scheduled_at = NULL,
                   account_deletion_token_hash = NULL,
                   account_deletion_token_expires_at = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [user.id],
            );
            await this.recordLifecycleEventFromEmail(
              client,
              user,
              'account.deletion_canceled_by_blocker',
              { blockers },
            );
            return { kind: 'canceled', user, blockers };
          }

          await this.recordLifecycleEventFromEmail(
            client,
            user,
            'account.deletion_completed',
            {},
          );
          await this.hardDeleteUser(client, user.id);
          return { kind: 'deleted', user };
        },
      );
      if (!result) break;
      results.push(result);
    }
    return results;
  }

  private async findBlockers(
    client: PoolClient,
    userId: number,
    lock: boolean,
  ): Promise<AccountDeletionBlocker[]> {
    const owned = await client.query<OwnedOrganizationRow>(
      `SELECT o.id, o.name, o.stripe_subscription_id, o.subscription_status
       FROM organization_members owner
       JOIN organizations o ON o.id = owner.organization_id
       WHERE owner.user_id = $1 AND owner.role = 'owner'
       ORDER BY o.id
       ${lock ? 'FOR UPDATE OF owner, o' : ''}`,
      [userId],
    );
    const blockers: AccountDeletionBlocker[] = [];

    for (const organization of owned.rows) {
      const organizationId = Number(organization.id);
      const members = await client.query<{ user_id: number | string }>(
        `SELECT user_id FROM organization_members
         WHERE organization_id = $1 ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
        [organizationId],
      );
      if (members.rows.some((member) => Number(member.user_id) !== userId)) {
        blockers.push({
          reason: 'OWNERSHIP_TRANSFER_REQUIRED',
          organizationId,
          organizationName: organization.name,
        });
      }

      const subscription = await client.query<{ active: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM subscriptions
           WHERE organization_id = $1
             AND status IN ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
         ) AS active`,
        [organizationId],
      );
      const organizationHasLiveBilling =
        organization.stripe_subscription_id !== null ||
        ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(
          organization.subscription_status ?? '',
        );
      if (organizationHasLiveBilling || subscription.rows[0]?.active === true) {
        blockers.push({
          reason: 'ACTIVE_SUBSCRIPTION',
          organizationId,
          organizationName: organization.name,
        });
      }

      const evidence = await client.query<{ retained: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM signature_documents
           WHERE organization_id = $1 AND status <> 'draft'
         ) AS retained`,
        [organizationId],
      );
      if (evidence.rows[0]?.retained === true) {
        blockers.push({
          reason: 'SIGNATURE_EVIDENCE_RETAINED',
          organizationId,
          organizationName: organization.name,
        });
      }
    }
    return blockers;
  }

  private async hardDeleteUser(client: PoolClient, userId: number): Promise<void> {
    const owned = await client.query<{ id: number | string }>(
      `SELECT o.id FROM organization_members owner
       JOIN organizations o ON o.id = owner.organization_id
       WHERE owner.user_id = $1 AND owner.role = 'owner'
       ORDER BY o.id FOR UPDATE OF owner, o`,
      [userId],
    );
    for (const organization of owned.rows) {
      const organizationId = Number(organization.id);
      await this.queueSignatureFileDeletion(client, organizationId);
      await client.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    await client.query(
      'UPDATE chat_widgets SET default_assigned_to = NULL WHERE default_assigned_to = $1',
      [userId],
    );
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  private queueSignatureFileDeletion(
    client: PoolClient,
    organizationId: number,
  ): Promise<unknown> {
    return client.query(
      `INSERT INTO signature_file_deletion_jobs
         (organization_id, document_id, file_url)
       SELECT $1, NULL, file_url FROM (
         SELECT file_url FROM signature_documents WHERE organization_id = $1
         UNION
         SELECT signed_file_url FROM signature_documents WHERE organization_id = $1
         UNION
         SELECT version.file_url
         FROM signature_document_versions version
         JOIN signature_documents document ON document.id = version.document_id
         WHERE document.organization_id = $1
         UNION
         SELECT file_url FROM signature_templates WHERE organization_id = $1
       ) files
       WHERE file_url IS NOT NULL
       ON CONFLICT (organization_id, file_url) DO UPDATE SET
         document_id = NULL,
         status = CASE WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN 'queued' ELSE signature_file_deletion_jobs.status END,
         next_attempt_at = CASE WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
         deleted_at = CASE WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
         last_error = CASE WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.last_error END,
         updated_at = CURRENT_TIMESTAMP`,
      [organizationId],
    );
  }

  private recordLifecycleEvent(
    client: PoolClient,
    input: {
      userId: number;
      emailHash: string;
      eventType: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return client.query(
      `INSERT INTO account_lifecycle_events
         (user_id, email_hash, event_type, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [input.userId, input.emailHash, input.eventType, JSON.stringify(input.metadata)],
    );
  }

  private recordLifecycleEventFromEmail(
    client: PoolClient,
    user: RecoveredAccount,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<unknown> {
    return client.query(
      `INSERT INTO account_lifecycle_events
         (user_id, email_hash, event_type, metadata)
       VALUES ($1, encode(digest(lower($2), 'sha256'), 'hex'), $3, $4::jsonb)`,
      [user.id, user.email, eventType, JSON.stringify(metadata)],
    );
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
