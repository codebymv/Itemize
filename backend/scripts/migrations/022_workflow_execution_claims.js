const {
  runWorkflowExecutionClaimMigration,
} = require('../../src/db_workflow_execution_claim_migrations');

exports.up = runWorkflowExecutionClaimMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_workflow_enrollments_execution_due');
  await pool.query(`
    ALTER TABLE workflow_enrollments
      DROP COLUMN IF EXISTS execution_lease_expires_at,
      DROP COLUMN IF EXISTS execution_claim_token,
      DROP COLUMN IF EXISTS execution_attempt_count
  `);
};
