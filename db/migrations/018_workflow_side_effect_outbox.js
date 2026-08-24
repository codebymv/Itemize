const {
  runWorkflowSideEffectOutboxMigration,
} = require('../../src/db_workflow_side_effect_migrations');

exports.up = runWorkflowSideEffectOutboxMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_sms_logs_workflow_side_effect');
  await pool.query('ALTER TABLE sms_logs DROP COLUMN IF EXISTS workflow_side_effect_id');
  await pool.query('DROP INDEX IF EXISTS idx_email_logs_workflow_side_effect');
  await pool.query('ALTER TABLE email_logs DROP COLUMN IF EXISTS workflow_side_effect_id');
  await pool.query('DROP TABLE IF EXISTS workflow_side_effect_outbox');
};
