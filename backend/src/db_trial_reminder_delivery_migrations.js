const runTrialReminderDeliveryMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trial_reminder_deliveries (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
      organization_name VARCHAR(255),
      plan VARCHAR(50),
      recipient_email VARCHAR(255),
      recipient_name VARCHAR(255),
      status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued', 'processing', 'retry', 'sent', 'dead_letter', 'cancelled'
      )),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_id VARCHAR(255),
      email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT trial_reminder_delivery_identity
        UNIQUE (organization_id, trial_ends_at)
    );

    CREATE INDEX IF NOT EXISTS idx_trial_reminder_deliveries_claim
      ON trial_reminder_deliveries(next_attempt_at, id)
      WHERE status IN ('queued', 'retry');

    CREATE INDEX IF NOT EXISTS idx_trial_reminder_deliveries_lease
      ON trial_reminder_deliveries(lease_expires_at, id)
      WHERE status = 'processing';
  `);
  return true;
};

module.exports = { runTrialReminderDeliveryMigration };
