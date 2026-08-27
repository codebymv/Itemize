const runAccountDeletionGraceMigration = async (pool) => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS account_deletion_requested_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS account_deletion_scheduled_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS account_deletion_token_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS account_deletion_token_expires_at TIMESTAMP WITH TIME ZONE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_deletion_token_hash
      ON users(account_deletion_token_hash)
      WHERE account_deletion_token_hash IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_account_deletion_scheduled
      ON users(account_deletion_scheduled_at)
      WHERE account_deletion_scheduled_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS account_lifecycle_events (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email_hash VARCHAR(64) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_account_lifecycle_events_user_created
      ON account_lifecycle_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_lifecycle_events_email_created
      ON account_lifecycle_events(email_hash, created_at DESC);
  `);
  return true;
};

module.exports = { runAccountDeletionGraceMigration };
