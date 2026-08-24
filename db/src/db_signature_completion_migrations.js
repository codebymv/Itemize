async function runSignatureCompletionMigration(pool) {
  await pool.query(`
    ALTER TABLE signature_delivery_outbox
      DROP CONSTRAINT IF EXISTS signature_delivery_outbox_delivery_type_check;
    ALTER TABLE signature_delivery_outbox
      ADD CONSTRAINT signature_delivery_outbox_delivery_type_check
      CHECK (delivery_type IN (
        'signature_request',
        'signature_reminder',
        'signer_completed',
        'document_completed',
        'signature_declined'
      ));

    CREATE TABLE IF NOT EXISTS signature_completion_jobs (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key VARCHAR(255) NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued',
          'processing',
          'retry',
          'completed',
          'dead_letter',
          'cancelled'
        )),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT,
      completed_at TIMESTAMP WITH TIME ZONE,
      cancelled_at TIMESTAMP WITH TIME ZONE,
      cancellation_reason VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_signature_completion_jobs_claim
      ON signature_completion_jobs(status, next_attempt_at, id)
      WHERE status IN ('queued', 'retry', 'processing');
  `);
  return true;
}

module.exports = { runSignatureCompletionMigration };
