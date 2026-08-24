/**
 * Faithful port of the retained connection persistence
 * (backend/src/routes/calendar-integrations.routes.js callback writes
 * and backend/src/services/calendarConnectionCredentials.js). The
 * single-winner FOR UPDATE credential load with lazy refresh and
 * key-rotation persistence must stay identical while both runtimes
 * serve the provider-calendars read.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  calendarTokenNeedsRotation,
  decryptCalendarToken,
  encryptCalendarToken,
} from './calendar-token-encryption';
import {
  GoogleCalendarOAuthProvider,
  GoogleTokens,
} from './google-calendar-oauth.provider';

export type CalendarConnectionRow = {
  id: number;
  user_id: number;
  organization_id: number;
  provider: string;
  provider_account_id: string;
  provider_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  token_generation: number;
  is_active: boolean;
};

export class CalendarRefreshTokenMissingError extends Error {
  constructor() {
    super('Calendar connection has no refresh capability');
    this.name = 'CalendarRefreshTokenMissingError';
  }
}

@Injectable()
export class CalendarOAuthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isOrganizationMember(
    userId: number,
    organizationId: number,
  ): Promise<boolean> {
    const membership = await this.pool.query(
      `SELECT 1 FROM organization_members
       WHERE user_id = $1 AND organization_id = $2`,
      [userId, organizationId],
    );
    return membership.rows.length > 0;
  }

  async saveGoogleConnection(values: {
    userId: number;
    organizationId: number;
    providerAccountId: string;
    providerEmail: string | null;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date;
  }): Promise<void> {
    const existing = await this.pool.query<{ id: number }>(
      `SELECT id FROM calendar_connections
       WHERE user_id = $1 AND organization_id = $2
         AND provider = 'google' AND provider_account_id = $3`,
      [values.userId, values.organizationId, values.providerAccountId],
    );

    const encryptedAccessToken = encryptCalendarToken(
      values.accessToken,
      'access',
    );
    const encryptedRefreshToken = values.refreshToken
      ? encryptCalendarToken(values.refreshToken, 'refresh')
      : null;

    if (existing.rows.length > 0) {
      await this.pool.query(
        `UPDATE calendar_connections
         SET
             access_token = $1,
             refresh_token = COALESCE($2, refresh_token),
             token_expires_at = $3,
             provider_email = $4,
             is_active = TRUE,
             error_message = NULL,
             error_count = 0,
             token_generation = token_generation + 1,
             updated_at = NOW()
         WHERE id = $5`,
        [
          encryptedAccessToken,
          encryptedRefreshToken,
          values.tokenExpiresAt,
          values.providerEmail,
          existing.rows[0].id,
        ],
      );
      return;
    }
    await this.pool.query(
      `INSERT INTO calendar_connections (
         user_id, organization_id, provider, provider_account_id,
         provider_email, access_token, refresh_token, token_expires_at
       ) VALUES ($1, $2, 'google', $3, $4, $5, $6, $7)`,
      [
        values.userId,
        values.organizationId,
        values.providerAccountId,
        values.providerEmail,
        encryptedAccessToken,
        encryptedRefreshToken,
        values.tokenExpiresAt,
      ],
    );
  }

  async loadGoogleConnection(
    scope: { connectionId: string; userId: number; organizationId: number },
    provider: GoogleCalendarOAuthProvider,
  ): Promise<CalendarConnectionRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<CalendarConnectionRow>(
        `SELECT id, user_id, organization_id, provider, provider_account_id,
                provider_email, access_token, refresh_token, token_expires_at,
                sync_enabled, sync_direction, last_sync_at, sync_cursor,
                selected_calendars, is_active, error_message, error_count,
                token_generation, created_at, updated_at
         FROM calendar_connections
         WHERE id = $1 AND user_id = $2 AND organization_id = $3
           AND provider = 'google'
         FOR UPDATE`,
        [scope.connectionId, scope.userId, scope.organizationId],
      );
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      const connection = result.rows[0];
      let accessToken = decryptCalendarToken(connection.access_token, 'access');
      let refreshToken = connection.refresh_token
        ? decryptCalendarToken(connection.refresh_token, 'refresh')
        : null;
      let tokenExpiresAt = connection.token_expires_at;
      let shouldPersist =
        calendarTokenNeedsRotation(connection.access_token) ||
        Boolean(
          connection.refresh_token &&
            calendarTokenNeedsRotation(connection.refresh_token),
        );

      if (provider.needsTokenRefresh(tokenExpiresAt)) {
        if (!refreshToken) throw new CalendarRefreshTokenMissingError();
        const refreshed: GoogleTokens =
          await provider.refreshAccessToken(refreshToken);
        if (!refreshed?.access_token) {
          throw new Error('Calendar provider returned no access token');
        }
        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token || refreshToken;
        tokenExpiresAt = refreshed.expiry_date
          ? new Date(refreshed.expiry_date)
          : new Date(Date.now() + 60 * 60 * 1000);
        shouldPersist = true;
      }

      if (shouldPersist) {
        const persisted = await client.query<{
          token_generation: number;
          updated_at: Date;
        }>(
          `UPDATE calendar_connections
           SET access_token = $1,
               refresh_token = $2,
               token_expires_at = $3,
               token_generation = token_generation + 1,
               error_message = NULL,
               updated_at = NOW()
           WHERE id = $4
           RETURNING token_generation, updated_at`,
          [
            encryptCalendarToken(accessToken, 'access'),
            refreshToken ? encryptCalendarToken(refreshToken, 'refresh') : null,
            tokenExpiresAt,
            connection.id,
          ],
        );
        connection.token_generation = persisted.rows[0].token_generation;
        (connection as CalendarConnectionRow & { updated_at?: Date }).updated_at =
          persisted.rows[0].updated_at;
      }

      await client.query('COMMIT');
      return {
        ...connection,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
