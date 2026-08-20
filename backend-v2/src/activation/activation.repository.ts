import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ActivationArtifactType = 'estimate' | 'invoice' | 'signature';
export type ActivationArtifactStage = 'viewed' | 'accepted' | 'signed' | 'paid';

@Injectable()
export class ActivationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insertArtifactSent(input: {
    organizationId: number;
    userId: number | null;
    artifactType: ActivationArtifactType;
    artifactId: number;
    source: string;
    dedupeKey: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO activation_events (
         organization_id,user_id,event_name,artifact_type,artifact_id,source,dedupe_key
       ) VALUES ($1,$2,'artifact_sent',$3,$4,$5,$6)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [
        input.organizationId,
        input.userId,
        input.artifactType,
        input.artifactId,
        input.source,
        input.dedupeKey,
      ],
    );
    return result.rows.length > 0;
  }

  async insertArtifactAdvanced(input: {
    organizationId: number;
    userId: number | null;
    artifactType: ActivationArtifactType;
    artifactId: number;
    stage: ActivationArtifactStage;
    source: string;
    dedupeKey: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO activation_events (
         organization_id,user_id,event_name,artifact_type,artifact_id,
         source,dedupe_key,properties
       ) VALUES ($1,$2,'artifact_advanced',$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [
        input.organizationId,
        input.userId,
        input.artifactType,
        input.artifactId,
        input.source,
        input.dedupeKey,
        JSON.stringify({ stage: input.stage }),
      ],
    );
    return result.rows.length > 0;
  }

  async insertReturnAfterSend(input: {
    organizationId: number;
    userId: number;
    source: string;
    dedupeKey: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO activation_events (
         organization_id,user_id,event_name,source,dedupe_key
       )
       SELECT $1,$2,'returned_after_send',$3,$4
       WHERE EXISTS (
         SELECT 1 FROM activation_events
         WHERE organization_id=$1 AND event_name='artifact_sent'
           AND occurred_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
       )
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [input.organizationId, input.userId, input.source, input.dedupeKey],
    );
    return result.rows.length > 0;
  }
}
