const { runSmsWebhookIdempotencyMigration } = require('../../src/db_sms_webhook_migrations');

exports.up = runSmsWebhookIdempotencyMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS sms_webhook_events');
};
