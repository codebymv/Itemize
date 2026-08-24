const {
  runWorkflowTriggerQueueMigration,
} = require('../../src/db_workflow_trigger_queue_migrations');

exports.up = runWorkflowTriggerQueueMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_workflow_triggers_org_type');
  await pool.query('DROP INDEX IF EXISTS idx_workflow_triggers_queue');
  await pool.query('DROP INDEX IF EXISTS idx_workflow_triggers_event_key');
  await pool.query(`
    ALTER TABLE workflow_triggers
      DROP CONSTRAINT IF EXISTS workflow_triggers_trigger_type_check,
      DROP CONSTRAINT IF EXISTS workflow_triggers_source_check,
      DROP CONSTRAINT IF EXISTS workflow_triggers_status_check,
      DROP COLUMN IF EXISTS occurred_at,
      DROP COLUMN IF EXISTS result,
      DROP COLUMN IF EXISTS last_error,
      DROP COLUMN IF EXISTS lease_expires_at,
      DROP COLUMN IF EXISTS next_attempt_at,
      DROP COLUMN IF EXISTS attempt_count,
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS event_key,
      DROP COLUMN IF EXISTS payload,
      DROP COLUMN IF EXISTS contact_id,
      DROP COLUMN IF EXISTS organization_id
  `);
};
