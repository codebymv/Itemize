const {
  runWorkflowSmsReconciliationMigration,
} = require('../../src/db_workflow_sms_reconciliation_migrations');

exports.up = runWorkflowSmsReconciliationMigration;

exports.down = async function down(pool) {
  await pool.query(`
    UPDATE workflow_side_effect_outbox
    SET status = 'dead_letter'
    WHERE status = 'reconciliation_required'
  `);
  await pool.query(`
    DROP INDEX IF EXISTS idx_workflow_side_effect_outbox_reconciliation
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP CONSTRAINT IF EXISTS workflow_side_effect_outbox_reconciliation_action_check,
      DROP CONSTRAINT IF EXISTS workflow_side_effect_outbox_status_check
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD CONSTRAINT workflow_side_effect_outbox_status_check
      CHECK (status IN (
        'queued', 'processing', 'retry', 'sent', 'dead_letter', 'cancelled'
      ))
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ALTER COLUMN status TYPE VARCHAR(20)
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP COLUMN IF EXISTS last_reconciled_by,
      DROP COLUMN IF EXISTS last_reconciliation_action,
      DROP COLUMN IF EXISTS last_reconciled_at,
      DROP COLUMN IF EXISTS reconciliation_reason,
      DROP COLUMN IF EXISTS reconciliation_required_at
  `);
};
