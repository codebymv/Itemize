const {
  runCalendarTokenEncryptionMigration,
} = require('../../src/db_calendar_token_encryption_migrations');

exports.up = runCalendarTokenEncryptionMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE calendar_connections
      DROP CONSTRAINT IF EXISTS calendar_connections_access_token_encrypted,
      DROP CONSTRAINT IF EXISTS calendar_connections_refresh_token_encrypted,
      DROP CONSTRAINT IF EXISTS calendar_connections_provider_account_identity,
      DROP COLUMN IF EXISTS token_generation;
    ALTER TABLE calendar_connections
      ADD CONSTRAINT calendar_connections_user_id_provider_provider_account_id_key
      UNIQUE (user_id, provider, provider_account_id);
  `);
};
