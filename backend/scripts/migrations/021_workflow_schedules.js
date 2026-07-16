const {
  runWorkflowScheduleMigration,
} = require('../../src/db_workflow_schedule_migrations');

exports.up = runWorkflowScheduleMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_workflows_scheduled_due');
  await pool.query(`
    ALTER TABLE workflows
      DROP COLUMN IF EXISTS last_triggered_at,
      DROP COLUMN IF EXISTS next_trigger_at,
      DROP COLUMN IF EXISTS scheduled_contact_id
  `);
};
