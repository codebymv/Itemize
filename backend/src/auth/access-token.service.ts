import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';

type AccessTokenPayload = {
  id?: unknown;
  sid?: unknown;
  iat?: number;
};

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async verify(token: string): Promise<{ userId: number; sessionId?: string }> {
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
        `SELECT role,auth_valid_after FROM users
         WHERE id = $1 AND account_deletion_scheduled_at IS NULL`,
        [userId],
      );
      if (!active.rows[0]) throw new Error('Account is unavailable');
      if (payload.sid === undefined && active.rows[0].auth_valid_after && (!payload.iat ||
        payload.iat * 1000 <= new Date(active.rows[0].auth_valid_after).getTime())) {
        throw new Error('Session predates security change');
      }
      if (payload.sid !== undefined) {
        if (typeof payload.sid !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sid)) throw new Error('Invalid session');
        const session = await this.pool.query(`SELECT id FROM auth_sessions WHERE id=$1 AND user_id=$2
          AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`,[payload.sid,userId]);
        if (!session.rows[0]) throw new Error('Session expired');
        return { userId,sessionId: payload.sid };
      }
      // Legacy access cookies live at most 15 minutes; never grant admin access.
      return { userId };
    } catch {
      throw itemizeGraphqlError('Authentication required', 'UNAUTHENTICATED');
    }
  }
}
