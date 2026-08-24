async function runWorkflowSideEffectOutboxMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_side_effect_outbox (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key VARCHAR(255) NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      enrollment_id INTEGER REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
      step_id INTEGER REFERENCES workflow_steps(id) ON DELETE SET NULL,
      enrollment_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
      effect_type VARCHAR(20) NOT NULL
        CHECK (effect_type IN ('email', 'sms', 'webhook')),
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'processing', 'retry', 'sent', 'dead_letter', 'cancelled',
          'reconciliation_required'
        )),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMP WITH TIME ZONE,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT,
      provider_id VARCHAR(255),
      cancelled_at TIMESTAMP WITH TIME ZONE,
      cancellation_reason VARCHAR(100),
      operator_retry_count INTEGER NOT NULL DEFAULT 0,
      last_operator_retry_at TIMESTAMP WITH TIME ZONE,
      reconciliation_required_at TIMESTAMP WITH TIME ZONE,
      reconciliation_reason VARCHAR(100),
      last_reconciled_at TIMESTAMP WITH TIME ZONE,
      last_reconciliation_action VARCHAR(20)
        CHECK (
          last_reconciliation_action IS NULL
          OR last_reconciliation_action IN ('accepted', 'resend')
        ),
      last_reconciled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP WITH TIME ZONE,
      UNIQUE(enrollment_id, step_id, enrollment_run_at)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_side_effect_outbox_queue
      ON workflow_side_effect_outbox(
        COALESCE(next_attempt_at, created_at), created_at, id
      )
      WHERE status IN ('queued', 'processing', 'retry')
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_side_effect_outbox_enrollment
      ON workflow_side_effect_outbox(enrollment_id, enrollment_run_at, step_id)
  `);

  await pool.query(`
    ALTER TABLE email_logs
      ADD COLUMN IF NOT EXISTS workflow_side_effect_id BIGINT
        REFERENCES workflow_side_effect_outbox(id) ON DELETE SET NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_workflow_side_effect
      ON email_logs(workflow_side_effect_id)
      WHERE workflow_side_effect_id IS NOT NULL
  `);

  await pool.query(`
    ALTER TABLE sms_logs
      ADD COLUMN IF NOT EXISTS workflow_side_effect_id BIGINT
        REFERENCES workflow_side_effect_outbox(id) ON DELETE SET NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_logs_workflow_side_effect
      ON sms_logs(workflow_side_effect_id)
      WHERE workflow_side_effect_id IS NOT NULL
  `);

  return true;
}

module.exports = { runWorkflowSideEffectOutboxMigration };
