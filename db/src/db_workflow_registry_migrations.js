const { workflowTriggerSqlList } = require('./domain/workflowRegistry');

async function runWorkflowRegistryMigration(pool) {
  await pool.query(`
    ALTER TABLE workflows
    DROP CONSTRAINT IF EXISTS workflows_trigger_type_check
  `);
  await pool.query(`
    ALTER TABLE workflows
    ADD CONSTRAINT workflows_trigger_type_check
    CHECK (trigger_type IN (${workflowTriggerSqlList}))
  `);
  return true;
}

module.exports = { runWorkflowRegistryMigration };
