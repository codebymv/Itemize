import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';

type AccessTokenPayload = {
  id?: unknown;
};

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async verify(token: string): Promise<{ userId: number }> {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw itemizeGraphqlError(
        'Authentication service is unavailable',
        'SERVICE_UNAVAILABLE',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret },
      );
      const userId = Number(payload.id);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error('Invalid access-token identity');
      }
      const active = await this.pool.query(
        `SELECT 1 FROM users
         WHERE id = $1 AND account_deletion_scheduled_at IS NULL`,
        [userId],
      );
      if (!active.rows[0]) throw new Error('Account is unavailable');
      return { userId };
    } catch {
      throw itemizeGraphqlError('Authentication required', 'UNAUTHENTICATED');
    }
  }
}
