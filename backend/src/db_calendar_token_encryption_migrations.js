const {
  inspectCalendarTokenEnvelope,
  encryptCalendarToken,
  rotateCalendarToken,
  calendarTokenNeedsRotation,
} = require('./utils/calendarTokenEncryption');

function secureStoredToken(value, tokenType) {
  if (value === null || value === undefined) return { value: null, changed: false };
  if (!inspectCalendarTokenEnvelope(value)) {
    return { value: encryptCalendarToken(value, tokenType), changed: true };
  }
  if (calendarTokenNeedsRotation(value)) {
    return { value: rotateCalendarToken(value, tokenType), changed: true };
  }
  return { value, changed: false };
}

async function runCalendarTokenEncryptionMigration(pool) {
  const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE calendar_connections IN SHARE ROW EXCLUSIVE MODE');
    await client.query(`
      ALTER TABLE calendar_connections
      ADD COLUMN IF NOT EXISTS token_generation BIGINT NOT NULL DEFAULT 0
    `);

    const connections = await client.query(`
      SELECT id, access_token, refresh_token
      FROM calendar_connections
      ORDER BY id
      FOR UPDATE
    `);
    for (const connection of connections.rows) {
      const accessToken = secureStoredToken(connection.access_token, 'access');
      const refreshToken = secureStoredToken(connection.refresh_token, 'refresh');
      if (!accessToken.changed && !refreshToken.changed) continue;
      await client.query(`
        UPDATE calendar_connections
        SET access_token = $1,
            refresh_token = $2,
            token_generation = token_generation + 1,
            updated_at = NOW()
        WHERE id = $3
      `, [accessToken.value, refreshToken.value, connection.id]);
    }

    await client.query(`
      ALTER TABLE calendar_connections
      DROP CONSTRAINT IF EXISTS calendar_connections_access_token_encrypted,
      DROP CONSTRAINT IF EXISTS calendar_connections_refresh_token_encrypted
    `);
    await client.query(`
      ALTER TABLE calendar_connections
      ADD CONSTRAINT calendar_connections_access_token_encrypted
        CHECK (
          access_token ~ '^enc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
        ),
      ADD CONSTRAINT calendar_connections_refresh_token_encrypted
        CHECK (
          refresh_token IS NULL
          OR refresh_token ~ '^enc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
        )
    `);

    await client.query(`
      ALTER TABLE calendar_connections
      DROP CONSTRAINT IF EXISTS calendar_connections_user_id_provider_provider_account_id_key
    `);
    await client.query(`
      ALTER TABLE calendar_connections
      DROP CONSTRAINT IF EXISTS calendar_connections_provider_account_identity
    `);
    await client.query(`
      ALTER TABLE calendar_connections
      ADD CONSTRAINT calendar_connections_provider_account_identity
      UNIQUE (organization_id, user_id, provider, provider_account_id)
    `);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client !== pool) client.release();
  }
}

module.exports = { runCalendarTokenEncryptionMigration };
