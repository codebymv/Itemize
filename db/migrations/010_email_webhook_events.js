const { runEmailWebhookMigration } = require('../../src/db_email_webhook_migrations');

exports.up = runEmailWebhookMigration;

exports.down = async function down(pool) {
    await pool.query('DROP TABLE IF EXISTS email_webhook_events');
    await pool.query('DROP INDEX IF EXISTS idx_campaign_recipients_external_message');
    await pool.query('ALTER TABLE campaign_recipients DROP COLUMN IF EXISTS provider_status_at');
    await pool.query('ALTER TABLE email_logs DROP COLUMN IF EXISTS unsubscribed_at');
    await pool.query('ALTER TABLE email_logs DROP COLUMN IF EXISTS bounced_at');
    await pool.query('ALTER TABLE email_logs DROP COLUMN IF EXISTS provider_status_at');
    await pool.query('ALTER TABLE contacts DROP COLUMN IF EXISTS email_bounced_at');
};
