async function runSocialMessageDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_message_delivery_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id INTEGER NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
      social_message_id INTEGER NOT NULL UNIQUE REFERENCES social_messages(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (
        status IN (
          'queued', 'processing', 'retry', 'provider_accepted',
          'dead_letter', 'reconciliation_required'
        )
      ),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_message_id VARCHAR(255),
      last_error TEXT,
      accepted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organization_id, idempotency_key)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_message_delivery_jobs_queue
      ON social_message_delivery_jobs(next_attempt_at, id)
      WHERE status IN ('queued', 'retry')
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_message_delivery_jobs_conversation
      ON social_message_delivery_jobs(organization_id, conversation_id, created_at, id)
  `);

  return true;
}

module.exports = { runSocialMessageDeliveryMigration };
