const {
  runWorkflowRegistryMigration,
} = require('../../src/db_workflow_registry_migrations');

exports.up = runWorkflowRegistryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE workflows
    DROP CONSTRAINT IF EXISTS workflows_trigger_type_check
  `);
};
