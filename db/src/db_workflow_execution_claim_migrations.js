async function runWorkflowExecutionClaimMigration(pool) {
  await pool.query(`
    ALTER TABLE workflow_enrollments
      ADD COLUMN IF NOT EXISTS execution_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS execution_claim_token UUID,
      ADD COLUMN IF NOT EXISTS execution_lease_expires_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_execution_due
      ON workflow_enrollments(next_action_at, id)
      WHERE status = 'active'
  `);
  return true;
}

module.exports = { runWorkflowExecutionClaimMigration };
