const {
    runEmailWebhookReconciliationMigration,
} = require('../../src/db_email_webhook_migrations');

exports.up = runEmailWebhookReconciliationMigration;

exports.down = async function down(pool) {
    await pool.query('DROP INDEX IF EXISTS idx_email_webhook_events_pending');
    await pool.query(`
        ALTER TABLE email_webhook_events
          DROP CONSTRAINT IF EXISTS email_webhook_events_reconciliation_status_check,
          DROP COLUMN IF EXISTS reconciliation_status,
          DROP COLUMN IF EXISTS reconciliation_reason,
          DROP COLUMN IF EXISTS reconciliation_attempt_count,
          DROP COLUMN IF EXISTS reconciliation_next_attempt_at,
          DROP COLUMN IF EXISTS reconciliation_lease_expires_at,
          DROP COLUMN IF EXISTS reconciliation_last_error,
          DROP COLUMN IF EXISTS reconciled_at
    `);
    await pool.query(`
        CREATE INDEX idx_email_webhook_events_pending
          ON email_webhook_events(received_at)
          WHERE processing_status = 'pending'
    `);
};
