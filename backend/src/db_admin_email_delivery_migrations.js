async function runAdminEmailDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_email_batches (
      id BIGSERIAL PRIMARY KEY,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      recipient_count INTEGER NOT NULL CHECK (recipient_count > 0),
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'sent', 'partial', 'failed', 'reconciliation_required')),
      sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
      failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT admin_email_batch_idempotency UNIQUE (requested_by_user_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS admin_email_deliveries (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES admin_email_batches(id) ON DELETE CASCADE,
      recipient_ordinal INTEGER NOT NULL CHECK (recipient_ordinal >= 0),
      recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      recipient_email VARCHAR(254) NOT NULL,
      recipient_name VARCHAR(255),
      subject VARCHAR(255) NOT NULL,
      body_html TEXT NOT NULL,
      email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'dead_letter', 'reconciliation_required')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_id VARCHAR(255),
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT admin_email_delivery_recipient UNIQUE (batch_id, recipient_ordinal)
    );

    CREATE INDEX IF NOT EXISTS idx_admin_email_deliveries_claim
      ON admin_email_deliveries(status, next_attempt_at, id)
      WHERE status IN ('queued', 'retry', 'processing');
    CREATE INDEX IF NOT EXISTS idx_admin_email_deliveries_batch
      ON admin_email_deliveries(batch_id, recipient_ordinal);
    CREATE INDEX IF NOT EXISTS idx_admin_email_batches_created
      ON admin_email_batches(created_at DESC, id DESC);
  `);
  return true;
}

module.exports = { runAdminEmailDeliveryMigration };
