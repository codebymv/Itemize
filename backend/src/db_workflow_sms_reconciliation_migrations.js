async function runWorkflowSmsReconciliationMigration(pool) {
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD COLUMN IF NOT EXISTS reconciliation_required_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reconciliation_reason VARCHAR(100),
      ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_reconciliation_action VARCHAR(20),
      ADD COLUMN IF NOT EXISTS last_reconciled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ALTER COLUMN status TYPE VARCHAR(32)
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP CONSTRAINT IF EXISTS workflow_side_effect_outbox_status_check
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD CONSTRAINT workflow_side_effect_outbox_status_check
      CHECK (status IN (
        'queued', 'processing', 'retry', 'sent', 'dead_letter', 'cancelled',
        'reconciliation_required'
      ))
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      DROP CONSTRAINT IF EXISTS workflow_side_effect_outbox_reconciliation_action_check
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD CONSTRAINT workflow_side_effect_outbox_reconciliation_action_check
      CHECK (
        last_reconciliation_action IS NULL
        OR last_reconciliation_action IN ('accepted', 'resend')
      )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_side_effect_outbox_reconciliation
      ON workflow_side_effect_outbox(reconciliation_required_at, id)
      WHERE status = 'reconciliation_required'
  `);
  return true;
}

module.exports = { runWorkflowSmsReconciliationMigration };
