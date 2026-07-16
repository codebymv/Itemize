const {
    runSubscriptionWebhookReconciliationMigration,
} = require('../../src/db_subscription_webhook_migrations');

exports.up = runSubscriptionWebhookReconciliationMigration;

exports.down = async function down(pool) {
    await pool.query('DROP INDEX IF EXISTS idx_stripe_subscription_events_reconciliation');
    await pool.query(`
        ALTER TABLE stripe_subscription_webhook_events
          DROP CONSTRAINT IF EXISTS stripe_subscription_webhook_events_reconciliation_status_check,
          DROP COLUMN IF EXISTS event_snapshot,
          DROP COLUMN IF EXISTS reconciliation_status,
          DROP COLUMN IF EXISTS reconciliation_reason,
          DROP COLUMN IF EXISTS reconciliation_attempt_count,
          DROP COLUMN IF EXISTS reconciliation_next_attempt_at,
          DROP COLUMN IF EXISTS reconciliation_lease_expires_at,
          DROP COLUMN IF EXISTS reconciliation_last_error,
          DROP COLUMN IF EXISTS reconciled_at
    `);
    await pool.query(`
        ALTER TABLE organizations
          DROP COLUMN IF EXISTS subscription_provider_event_id
    `);
};
