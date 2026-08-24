const {
  runWorkflowLifecycleMigration,
} = require('../../src/db_workflow_lifecycle_migrations');

exports.up = runWorkflowLifecycleMigration;

exports.down = async function down(pool) {
  await pool.query(`
    UPDATE workflow_side_effect_outbox
    SET status = 'dead_letter'
    WHERE status = 'cancelled'
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP CONSTRAINT IF EXISTS workflow_side_effect_outbox_status_check
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD CONSTRAINT workflow_side_effect_outbox_status_check
      CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'dead_letter'))
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP COLUMN IF EXISTS last_operator_retry_at,
      DROP COLUMN IF EXISTS operator_retry_count,
      DROP COLUMN IF EXISTS cancellation_reason,
      DROP COLUMN IF EXISTS cancelled_at
  `);
  await pool.query(`
    ALTER TABLE workflow_enrollments
      DROP COLUMN IF EXISTS paused_at,
      DROP COLUMN IF EXISTS pause_reason
  `);
};
