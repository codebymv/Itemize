import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { itemizeGraphqlError } from '../common/graphql-error';

@Injectable()
export class AuthSessionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(userId: number, passwordHash?: string | null): Promise<string> {
    const id = randomUUID();
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const user = (
        await db.query(
          `SELECT password_hash FROM users WHERE id=$1
        AND account_deletion_scheduled_at IS NULL FOR UPDATE`,
          [userId],
        )
      ).rows[0];
      if (
        !user ||
        (passwordHash !== undefined && user.password_hash !== passwordHash)
      ) {
        throw itemizeGraphqlError(
          'Sign-in details changed. Please sign in again.',
          'UNAUTHENTICATED',
        );
      }
      await db.query(
        `INSERT INTO auth_sessions(id,user_id,expires_at)
        VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '30 days')`,
        [id, userId],
      );
      await db.query('COMMIT');
      return id;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async requireActive(userId: number, sessionId: unknown): Promise<string> {
    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      throw itemizeGraphqlError('Please sign in again', 'UNAUTHENTICATED');
    }
    const result = await this.pool.query(
      `SELECT id FROM auth_sessions
      WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`,
      [sessionId, userId],
    );
    if (!result.rows[0])
      throw itemizeGraphqlError('Please sign in again', 'UNAUTHENTICATED');
    return sessionId;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP,
      admin_verified_at=NULL,recovery_until=NULL WHERE id=$1`,
      [sessionId],
    );
  }
}
