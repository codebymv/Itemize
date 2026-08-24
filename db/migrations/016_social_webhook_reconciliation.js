const {
  runSocialWebhookReconciliationMigration,
} = require('../../src/db_social_webhook_migrations');

exports.up = runSocialWebhookReconciliationMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_social_webhook_events_reconciliation_queue');
  await pool.query('DROP INDEX IF EXISTS idx_social_webhook_events_work_queue');
  await pool.query(`
    ALTER TABLE social_webhook_events
      DROP CONSTRAINT IF EXISTS social_webhook_events_reconciliation_status_check,
      DROP CONSTRAINT IF EXISTS social_webhook_events_work_status_check,
      DROP COLUMN IF EXISTS reconciliation_last_error,
      DROP COLUMN IF EXISTS reconciliation_lease_expires_at,
      DROP COLUMN IF EXISTS reconciliation_next_attempt_at,
      DROP COLUMN IF EXISTS reconciliation_attempt_count,
      DROP COLUMN IF EXISTS reconciliation_status,
      DROP COLUMN IF EXISTS work_last_error,
      DROP COLUMN IF EXISTS work_lease_expires_at,
      DROP COLUMN IF EXISTS work_next_attempt_at,
      DROP COLUMN IF EXISTS work_attempt_count,
      DROP COLUMN IF EXISTS work_status,
      DROP COLUMN IF EXISTS media_type,
      DROP COLUMN IF EXISTS media_url,
      DROP COLUMN IF EXISTS text_content,
      DROP COLUMN IF EXISTS message_type
  `);
};
