const {
    runSubscriptionWebhookNotificationOutboxMigration,
} = require('../../src/db_subscription_webhook_migrations');

exports.up = runSubscriptionWebhookNotificationOutboxMigration;

exports.down = async function down(pool) {
    await pool.query('DROP INDEX IF EXISTS idx_stripe_subscription_events_pending');
    await pool.query(`
        ALTER TABLE stripe_subscription_webhook_events
          DROP CONSTRAINT IF EXISTS stripe_subscription_webhook_events_notification_status_check,
          DROP COLUMN IF EXISTS notification_attempt_count,
          DROP COLUMN IF EXISTS notification_next_attempt_at,
          DROP COLUMN IF EXISTS notification_lease_expires_at,
          DROP COLUMN IF EXISTS notification_last_error,
          DROP COLUMN IF EXISTS notification_provider_id,
          DROP COLUMN IF EXISTS notification_sent_at
    `);
    await pool.query(`
        UPDATE stripe_subscription_webhook_events
        SET notification_status = 'failed'
        WHERE notification_status NOT IN ('not_required', 'pending', 'sent', 'failed')
    `);
    await pool.query(`
        ALTER TABLE stripe_subscription_webhook_events
          ADD CONSTRAINT stripe_subscription_webhook_events_notification_status_check
          CHECK (notification_status IN ('not_required', 'pending', 'sent', 'failed'))
    `);
    await pool.query(`
        CREATE INDEX idx_stripe_subscription_events_pending
          ON stripe_subscription_webhook_events(received_at)
          WHERE processing_status = 'pending' OR notification_status = 'pending'
    `);
};
