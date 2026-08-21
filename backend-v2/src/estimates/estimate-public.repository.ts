import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { EstimateEmailPayload } from './estimates.repository';

export type PublicEstimateState = 'sent' | 'accepted' | 'declined';

export type PublicEstimateCapability = {
  capability_id: number;
  organization_id: number;
  estimate_id: number;
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
      return {
        kind: 'updated',
        capability: {
          ...capability,
          status: row.status,
          viewed_at: row.viewed_at,
          accepted_at: row.accepted_at,
          declined_at: row.declined_at,
        },
      };
    });
  }

  private async capability(
    client: PoolClient,
    tokenHash: string,
    lock: boolean,
  ): Promise<PublicEstimateCapability | null> {
    const result = await client.query<PublicEstimateCapability>(
      `SELECT capability.id AS capability_id, capability.organization_id,
              capability.estimate_id, estimate.estimate_number,
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
