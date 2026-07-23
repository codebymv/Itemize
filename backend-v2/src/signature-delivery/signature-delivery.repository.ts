import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class SignatureDeliveryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id=$1',
      [organizationId],
    );
    return result.rows[0] !== undefined
      && ['starter', 'unlimited', 'pro'].includes(result.rows[0].plan ?? 'starter');
  }
}
