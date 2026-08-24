async function runWorkflowLifecycleMigration(pool) {
  await pool.query(`
    ALTER TABLE workflow_enrollments
      ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(50),
      ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    ALTER TABLE workflow_side_effect_outbox
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(100),
      ADD COLUMN IF NOT EXISTS operator_retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_operator_retry_at TIMESTAMP WITH TIME ZONE
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
  return true;
}

module.exports = { runWorkflowLifecycleMigration };
