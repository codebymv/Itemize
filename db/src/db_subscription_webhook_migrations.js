async function runSubscriptionWebhookMigration(pool) {
  await pool.query(`
    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS subscription_provider_updated_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_subscription_webhook_events (
      stripe_event_id VARCHAR(100) PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      object_id VARCHAR(100) NOT NULL,
      object_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      processing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processed', 'ignored', 'unmatched', 'ambiguous', 'stale')),
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      previous_plan VARCHAR(50),
      new_plan VARCHAR(50),
      notification_type VARCHAR(50),
      notification_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
        CHECK (notification_status IN ('not_required', 'pending', 'sent', 'failed')),
      received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_stripe_subscription_events_object
      ON stripe_subscription_webhook_events(object_id, object_created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_stripe_subscription_events_pending
      ON stripe_subscription_webhook_events(received_at)
      WHERE processing_status = 'pending' OR notification_status = 'pending'
  `);

  return true;
}

async function runSubscriptionWebhookNotificationOutboxMigration(pool) {
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      ADD COLUMN IF NOT EXISTS notification_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS notification_next_attempt_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS notification_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS notification_last_error TEXT,
      ADD COLUMN IF NOT EXISTS notification_provider_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      DROP CONSTRAINT IF EXISTS stripe_subscription_webhook_events_notification_status_check
  `);
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      ADD CONSTRAINT stripe_subscription_webhook_events_notification_status_check
      CHECK (notification_status IN (
        'not_required', 'pending', 'processing', 'retry', 'sent', 'failed', 'dead_letter'
      ))
  `);
  await pool.query('DROP INDEX IF EXISTS idx_stripe_subscription_events_pending');
  await pool.query(`
    CREATE INDEX idx_stripe_subscription_events_pending
      ON stripe_subscription_webhook_events(notification_next_attempt_at, received_at)
      WHERE processing_status = 'pending'
         OR notification_status IN ('pending', 'retry', 'processing')
  `);
  return true;
}

async function runSubscriptionWebhookReconciliationMigration(pool) {
  await pool.query(`
    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS subscription_provider_event_id VARCHAR(100)
  `);
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      ADD COLUMN IF NOT EXISTS event_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS reconciliation_reason VARCHAR(20),
      ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reconciliation_next_attempt_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_last_error TEXT,
      ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      DROP CONSTRAINT IF EXISTS stripe_subscription_webhook_events_reconciliation_status_check
  `);
  await pool.query(`
    ALTER TABLE stripe_subscription_webhook_events
      ADD CONSTRAINT stripe_subscription_webhook_events_reconciliation_status_check
      CHECK (reconciliation_status IN (
        'not_required', 'pending', 'processing', 'retry', 'resolved', 'dead_letter'
      ))
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_stripe_subscription_events_reconciliation
      ON stripe_subscription_webhook_events(reconciliation_next_attempt_at, received_at)
      WHERE reconciliation_status IN ('pending', 'retry', 'processing')
  `);
  return true;
}

module.exports = {
  runSubscriptionWebhookMigration,
  runSubscriptionWebhookNotificationOutboxMigration,
  runSubscriptionWebhookReconciliationMigration,
};
