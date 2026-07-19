const googleCalendarService = require('./googleCalendarService');
const {
  decryptCalendarToken,
  encryptCalendarToken,
  calendarTokenNeedsRotation,
} = require('../utils/calendarTokenEncryption');

async function loadGoogleCalendarConnection(pool, scope, dependencies = {}) {
  const refreshAccessToken = dependencies.refreshAccessToken
    || googleCalendarService.refreshAccessToken;
  const needsTokenRefresh = dependencies.needsTokenRefresh
    || googleCalendarService.needsTokenRefresh;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const values = [scope.connectionId, scope.userId, scope.organizationId];
    const activeClause = scope.requireActive ? 'AND is_active = TRUE' : '';
    const result = await client.query(`
      SELECT id, user_id, organization_id, provider, provider_account_id,
             provider_email, access_token, refresh_token, token_expires_at,
             sync_enabled, sync_direction, last_sync_at, sync_cursor,
             selected_calendars, is_active, error_message, error_count,
             token_generation, created_at, updated_at
      FROM calendar_connections
      WHERE id = $1 AND user_id = $2 AND organization_id = $3
        AND provider = 'google'
        ${activeClause}
      FOR UPDATE
    `, values);

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
    let shouldPersist = calendarTokenNeedsRotation(connection.access_token)
      || Boolean(connection.refresh_token && calendarTokenNeedsRotation(connection.refresh_token));

    if (needsTokenRefresh(tokenExpiresAt)) {
      if (!refreshToken) {
        const error = new Error('Calendar connection has no refresh capability');
        error.code = 'CALENDAR_REFRESH_TOKEN_MISSING';
        throw error;
      }
      const refreshed = await refreshAccessToken(refreshToken);
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
      const persisted = await client.query(`
        UPDATE calendar_connections
        SET access_token = $1,
            refresh_token = $2,
            token_expires_at = $3,
            token_generation = token_generation + 1,
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $4
        RETURNING token_generation, updated_at
      `, [
        encryptCalendarToken(accessToken, 'access'),
        refreshToken ? encryptCalendarToken(refreshToken, 'refresh') : null,
        tokenExpiresAt,
        connection.id,
      ]);
      connection.token_generation = persisted.rows[0].token_generation;
      connection.updated_at = persisted.rows[0].updated_at;
    }

    await client.query('COMMIT');
    return {
      ...connection,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { loadGoogleCalendarConnection };
