import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ActivationArtifactType = 'estimate' | 'invoice' | 'signature';

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
}
