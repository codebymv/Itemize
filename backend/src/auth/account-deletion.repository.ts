import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

type OwnedOrganizationRow = {
  id: number | string;
  name: string;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
};

export type AccountDeletionOutcome =
  | { kind: 'deleted' }
  | { kind: 'not_found' }
  | { kind: 'account_changed' }
  | { kind: 'ownership_transfer_required'; organizationName: string }
  | { kind: 'active_subscription'; organizationName: string }
  | { kind: 'evidence_retained'; organizationName: string };

@Injectable()
export class AccountDeletionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  deleteUser(
    userId: number,
    expectedPasswordHash: string | null,
  ): Promise<AccountDeletionOutcome> {
    return this.transaction(async (client) => {
      const user = await client.query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rows[0]) return { kind: 'not_found' };
      if (user.rows[0].password_hash !== expectedPasswordHash) {
        return { kind: 'account_changed' };
      }

      const owned = await client.query<OwnedOrganizationRow>(
        `SELECT o.id, o.name, o.stripe_subscription_id, o.subscription_status
         FROM organization_members owner
         JOIN organizations o ON o.id = owner.organization_id
         WHERE owner.user_id = $1 AND owner.role = 'owner'
         ORDER BY o.id
         FOR UPDATE OF owner, o`,
        [userId],
      );

      for (const organization of owned.rows) {
        const organizationId = Number(organization.id);
        const members = await client.query<{ user_id: number | string }>(
          `SELECT user_id FROM organization_members
           WHERE organization_id = $1
           ORDER BY id
           FOR UPDATE`,
          [organizationId],
        );
        if (members.rows.some((member) => Number(member.user_id) !== userId)) {
          return {
            kind: 'ownership_transfer_required',
            organizationName: organization.name,
          };
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
          ['active', 'past_due', 'unpaid', 'incomplete'].includes(
            organization.subscription_status ?? '',
          );
        if (organizationHasLiveBilling || subscription.rows[0]?.active === true) {
          return {
            kind: 'active_subscription',
            organizationName: organization.name,
          };
        }

        const documents = await client.query<{ status: string }>(
          `SELECT status FROM signature_documents
           WHERE organization_id = $1
           ORDER BY id
           FOR UPDATE`,
          [organizationId],
        );
        if (documents.rows.some((document) => document.status !== 'draft')) {
          return {
            kind: 'evidence_retained',
            organizationName: organization.name,
          };
        }
      }

      for (const organization of owned.rows) {
        const organizationId = Number(organization.id);
        await this.queueSignatureFileDeletion(client, organizationId);
        await client.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
      }

      // This legacy assignment reference intentionally has no ON DELETE action.
      await client.query(
        'UPDATE chat_widgets SET default_assigned_to = NULL WHERE default_assigned_to = $1',
        [userId],
      );
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      return { kind: 'deleted' };
    });
  }

  private queueSignatureFileDeletion(
    client: PoolClient,
    organizationId: number,
  ): Promise<unknown> {
    return client.query(
      `INSERT INTO signature_file_deletion_jobs
         (organization_id, document_id, file_url)
       SELECT $1, NULL, file_url FROM (
         SELECT file_url FROM signature_documents
         WHERE organization_id = $1
         UNION
         SELECT signed_file_url AS file_url FROM signature_documents
         WHERE organization_id = $1
         UNION
         SELECT version.file_url
         FROM signature_document_versions version
         JOIN signature_documents document ON document.id = version.document_id
         WHERE document.organization_id = $1
         UNION
         SELECT file_url FROM signature_templates
         WHERE organization_id = $1
       ) files
       WHERE file_url IS NOT NULL
       ON CONFLICT (organization_id, file_url) DO UPDATE SET
         document_id = NULL,
         status = CASE
           WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN 'queued' ELSE signature_file_deletion_jobs.status END,
         next_attempt_at = CASE
           WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
         deleted_at = CASE
           WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
         last_error = CASE
           WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.last_error END,
         updated_at = CURRENT_TIMESTAMP`,
      [organizationId],
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
