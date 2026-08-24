import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { EstimateEmailPayload } from './estimates.repository';

export type PublicEstimateState = 'sent' | 'accepted' | 'declined';

export type PublicEstimateCapability = {
  capability_id: number;
  delivery_id: number;
  organization_id: number;
  estimate_id: number;
  estimate_created_by: number | null;
  requested_by_user_id: number | null;
  estimate_number: string;
  organization_name: string;
  status: PublicEstimateState;
  sent_at: Date | null;
  viewed_at: Date | null;
  accepted_at: Date | null;
  declined_at: Date | null;
  expires_at: Date;
  payload: EstimateEmailPayload;
};

export type PublicEstimateTransition =
  | { kind: 'updated'; capability: PublicEstimateCapability }
  | { kind: 'replayed'; capability: PublicEstimateCapability }
  | { kind: 'conflict'; status: PublicEstimateState }
  | { kind: 'not-found' };

@Injectable()
export class EstimatePublicRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async open(tokenHash: string): Promise<PublicEstimateCapability | null> {
    return this.transaction(async (client) => {
      const capability = await this.capability(client, tokenHash, true);
      if (!capability) return null;
      if (!capability.viewed_at) {
        const viewed = await client.query<PublicEstimateCapability>(
          `UPDATE estimates
           SET viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2 AND viewed_at IS NULL
           RETURNING viewed_at`,
          [capability.estimate_id, capability.organization_id],
        );
        capability.viewed_at = viewed.rows[0]?.viewed_at ?? capability.viewed_at;
      }
      return capability;
    });
  }

  async accept(tokenHash: string): Promise<PublicEstimateTransition> {
    return this.transition(tokenHash, 'accepted');
  }

  async decline(tokenHash: string): Promise<PublicEstimateTransition> {
    return this.transition(tokenHash, 'declined');
  }

  private async transition(
    tokenHash: string,
    target: 'accepted' | 'declined',
  ): Promise<PublicEstimateTransition> {
    return this.transaction(async (client) => {
      const capability = await this.capability(client, tokenHash, true);
      if (!capability) return { kind: 'not-found' };
      if (capability.status === target) {
        return { kind: 'replayed', capability };
      }
      if (capability.status !== 'sent') {
        return { kind: 'conflict', status: capability.status };
      }
      const timestampColumn = target === 'accepted' ? 'accepted_at' : 'declined_at';
      const updated = await client.query<{
        status: PublicEstimateState;
        viewed_at: Date;
        accepted_at: Date | null;
        declined_at: Date | null;
      }>(
        `UPDATE estimates
         SET status = $3,
             viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP),
             ${timestampColumn} = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2 AND status = 'sent'
         RETURNING status, viewed_at, accepted_at, declined_at`,
        [capability.estimate_id, capability.organization_id, target],
      );
      const row = updated.rows[0];
      if (!row) return { kind: 'conflict', status: capability.status };
      await client.query(
        `UPDATE estimate_public_capabilities
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE estimate_id = $1 AND organization_id = $2
           AND id <> $3 AND revoked_at IS NULL`,
        [capability.estimate_id, capability.organization_id, capability.capability_id],
      );
      const transitioned: PublicEstimateCapability = {
        ...capability,
        status: row.status,
        viewed_at: row.viewed_at,
        accepted_at: row.accepted_at,
        declined_at: row.declined_at,
      };
      await this.enqueueResponseNotification(client, transitioned, target);
      return {
        kind: 'updated',
        capability: transitioned,
      };
    });
  }

  private async enqueueResponseNotification(
    client: PoolClient,
    capability: PublicEstimateCapability,
    response: 'accepted' | 'declined',
  ): Promise<void> {
    const recipient = await this.responseRecipient(client, capability);
    if (!recipient) return;
    const responseAt = response === 'accepted'
      ? capability.accepted_at
      : capability.declined_at;
    if (!responseAt) throw new Error('Estimate response timestamp is missing');
    const businessName = capability.payload.businessName?.trim()
      || capability.organization_name?.trim()
      || 'Itemize workspace';
    const subject = `Your estimate was ${response}`;
    await client.query(
      `INSERT INTO estimate_email_deliveries (
         organization_id,estimate_id,requested_by_user_id,delivery_type,
         idempotency_key,recipient_email,subject,payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (organization_id,estimate_id,delivery_type,idempotency_key) DO NOTHING`,
      [
        capability.organization_id,
        capability.estimate_id,
        recipient.userId,
        response === 'accepted' ? 'estimate_accepted' : 'estimate_declined',
        `estimate-response-v1:${capability.estimate_id}:${response}`,
        recipient.email,
        subject,
        JSON.stringify({
          response,
          estimateNumber: capability.estimate_number,
          customerName: capability.payload.customerName,
          total: capability.payload.total,
          currency: capability.payload.currency || 'USD',
          businessName,
          recipientName: recipient.name,
          respondedAt: responseAt.toISOString(),
        }),
      ],
    );
  }

  private async responseRecipient(
    client: PoolClient,
    capability: PublicEstimateCapability,
  ): Promise<{ userId: number | null; email: string; name: string | null } | null> {
    const preferredUserIds = [
      capability.requested_by_user_id,
      capability.estimate_created_by,
    ].filter((value, index, values): value is number =>
      value !== null && values.indexOf(value) === index);
    if (preferredUserIds.length > 0) {
      const preferred = await client.query<{
        id: number; email: string; name: string | null;
      }>(
        `SELECT user_account.id,user_account.email,user_account.name
         FROM organization_members member
         JOIN users user_account ON user_account.id=member.user_id
         WHERE member.organization_id=$1
           AND member.user_id=ANY($2::int[])
           AND NULLIF(BTRIM(user_account.email),'') IS NOT NULL
         ORDER BY array_position($2::int[],member.user_id)
         LIMIT 1`,
        [capability.organization_id, preferredUserIds],
      );
      if (preferred.rows[0]) {
        return {
          userId: Number(preferred.rows[0].id),
          email: preferred.rows[0].email.trim(),
          name: preferred.rows[0].name?.trim() || null,
        };
      }
    }
    const owner = await client.query<{
      id: number; email: string; name: string | null;
    }>(
      `SELECT user_account.id,user_account.email,user_account.name
       FROM organization_members member
       JOIN users user_account ON user_account.id=member.user_id
       WHERE member.organization_id=$1 AND member.role='owner'
         AND NULLIF(BTRIM(user_account.email),'') IS NOT NULL
       ORDER BY member.joined_at,member.user_id
       LIMIT 1`,
      [capability.organization_id],
    );
    if (owner.rows[0]) {
      return {
        userId: Number(owner.rows[0].id),
        email: owner.rows[0].email.trim(),
        name: owner.rows[0].name?.trim() || null,
      };
    }
    const businessEmail = capability.payload.businessEmail?.trim();
    return businessEmail
      ? { userId: null, email: businessEmail, name: null }
      : null;
  }

  private async capability(
    client: PoolClient,
    tokenHash: string,
    lock: boolean,
  ): Promise<PublicEstimateCapability | null> {
    const result = await client.query<PublicEstimateCapability>(
      `SELECT capability.id AS capability_id, capability.delivery_id,
              capability.organization_id, capability.estimate_id,
              estimate.created_by AS estimate_created_by,
              delivery.requested_by_user_id, estimate.estimate_number,
              organization.name AS organization_name,
              estimate.status, estimate.sent_at, estimate.viewed_at,
              estimate.accepted_at, estimate.declined_at,
              capability.expires_at, delivery.payload
       FROM estimate_public_capabilities capability
       JOIN estimates estimate
         ON estimate.id = capability.estimate_id
        AND estimate.organization_id = capability.organization_id
       JOIN organizations organization
         ON organization.id = capability.organization_id
       JOIN estimate_email_deliveries delivery
         ON delivery.id = capability.delivery_id
        AND delivery.estimate_id = capability.estimate_id
        AND delivery.organization_id = capability.organization_id
       WHERE capability.token_hash = $1
         AND capability.revoked_at IS NULL
         AND capability.expires_at > CURRENT_TIMESTAMP
         AND delivery.status = 'sent'
         AND delivery.delivery_type = 'estimate_sent'
         AND estimate.status IN ('sent', 'accepted', 'declined')
       ${lock ? 'FOR UPDATE OF capability, estimate' : ''}`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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
