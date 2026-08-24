async function runEmailWebhookMigration(pool) {
  await pool.query(`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query(`
    ALTER TABLE email_logs
      ADD COLUMN IF NOT EXISTS provider_status_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query(`
    ALTER TABLE campaign_recipients
      ADD COLUMN IF NOT EXISTS provider_status_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_campaign_recipients_external_message
      ON campaign_recipients(external_message_id)
      WHERE external_message_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_webhook_events (
      svix_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      external_id VARCHAR(255) NOT NULL,
      event_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      processing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processed', 'ignored')),
      matched_email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
      matched_campaign_recipient_id INTEGER REFERENCES campaign_recipients(id) ON DELETE SET NULL,
      received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_email_webhook_events_external
      ON email_webhook_events(external_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_email_webhook_events_pending
      ON email_webhook_events(received_at)
      WHERE processing_status = 'pending'
  `);

  return true;
}

async function runEmailWebhookReconciliationMigration(pool) {
  await pool.query(`
    ALTER TABLE email_webhook_events
      ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS reconciliation_reason VARCHAR(20),
      ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reconciliation_next_attempt_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_last_error TEXT,
      ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    ALTER TABLE email_webhook_events
      DROP CONSTRAINT IF EXISTS email_webhook_events_reconciliation_status_check
  `);
  await pool.query(`
    ALTER TABLE email_webhook_events
      ADD CONSTRAINT email_webhook_events_reconciliation_status_check
      CHECK (reconciliation_status IN (
        'not_required', 'pending', 'processing', 'retry', 'resolved', 'dead_letter'
      ))
  `);
  await pool.query(`
    UPDATE email_webhook_events SET
      reconciliation_status = 'pending',
      reconciliation_reason = COALESCE(reconciliation_reason, 'unmatched'),
      reconciliation_next_attempt_at = COALESCE(reconciliation_next_attempt_at, received_at)
    WHERE processing_status = 'pending'
      AND reconciliation_status = 'not_required'
  `);
  await pool.query('DROP INDEX IF EXISTS idx_email_webhook_events_pending');
  await pool.query(`
    CREATE INDEX idx_email_webhook_events_pending
      ON email_webhook_events(reconciliation_next_attempt_at, received_at)
      WHERE reconciliation_status IN ('pending', 'processing', 'retry')
  `);
  return true;
}

module.exports = {
  runEmailWebhookMigration,
  runEmailWebhookReconciliationMigration,
};
