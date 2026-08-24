async function runSocialWebhookMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_webhook_events (
      event_key VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(40) NOT NULL,
      external_message_id VARCHAR(100) NOT NULL,
      channel_type VARCHAR(20) NOT NULL
        CHECK (channel_type IN ('facebook', 'instagram')),
      destination_id VARCHAR(100) NOT NULL,
      sender_id VARCHAR(100) NOT NULL,
      event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
      processing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processed', 'ignored', 'unmatched', 'ambiguous')),
      matched_channel_id INTEGER REFERENCES social_channels(id) ON DELETE SET NULL,
      social_message_id INTEGER REFERENCES social_messages(id) ON DELETE SET NULL,
      received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_webhook_events_destination
      ON social_webhook_events(channel_type, destination_id, received_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_webhook_events_pending
      ON social_webhook_events(received_at)
      WHERE processing_status = 'pending'
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_messages_channel_external_unique
      ON social_messages(channel_id, external_message_id)
      WHERE external_message_id IS NOT NULL
  `);

  return true;
}

async function runSocialWebhookReconciliationMigration(pool) {
  await pool.query(`
    ALTER TABLE social_webhook_events
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS text_content TEXT,
      ADD COLUMN IF NOT EXISTS media_url TEXT,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS work_status VARCHAR(20) NOT NULL DEFAULT 'completed',
      ADD COLUMN IF NOT EXISTS work_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS work_next_attempt_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS work_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS work_last_error TEXT,
      ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reconciliation_next_attempt_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_last_error TEXT
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'social_webhook_events_work_status_check'
      ) THEN
        ALTER TABLE social_webhook_events
          ADD CONSTRAINT social_webhook_events_work_status_check
          CHECK (work_status IN ('queued', 'processing', 'completed', 'retry', 'dead_letter'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'social_webhook_events_reconciliation_status_check'
      ) THEN
        ALTER TABLE social_webhook_events
          ADD CONSTRAINT social_webhook_events_reconciliation_status_check
          CHECK (reconciliation_status IN (
            'not_required', 'pending', 'processing', 'retry', 'resolved', 'dead_letter'
          ));
      END IF;
    END $$
  `);

  await pool.query(`
    UPDATE social_webhook_events SET
      work_status = CASE
        WHEN processing_status = 'pending' AND message_type IS NOT NULL THEN 'queued'
        ELSE 'completed'
      END,
      reconciliation_status = CASE
        WHEN processing_status IN ('unmatched', 'ambiguous')
          AND message_type IS NOT NULL THEN 'pending'
        ELSE 'not_required'
      END
    WHERE work_attempt_count = 0
      AND work_status = 'completed'
      AND reconciliation_status = 'not_required'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_webhook_events_work_queue
      ON social_webhook_events(COALESCE(work_next_attempt_at, received_at), event_timestamp, event_key)
      WHERE work_status IN ('queued', 'processing', 'retry')
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_webhook_events_reconciliation_queue
      ON social_webhook_events(
        COALESCE(reconciliation_next_attempt_at, received_at), event_timestamp, event_key
      )
      WHERE reconciliation_status IN ('pending', 'processing', 'retry')
  `);

  return true;
}

module.exports = {
  runSocialWebhookMigration,
  runSocialWebhookReconciliationMigration,
};
