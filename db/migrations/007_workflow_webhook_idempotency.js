const { runWorkflowWebhookIdempotencyMigration } = require('../../src/db_workflow_webhook_migrations');

exports.up = runWorkflowWebhookIdempotencyMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_workflow_triggers_delivery');
  await pool.query('ALTER TABLE workflow_triggers DROP COLUMN IF EXISTS delivery_key');
};
