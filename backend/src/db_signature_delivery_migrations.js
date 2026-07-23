async function runSignatureDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_delivery_outbox (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key VARCHAR(255) NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
      recipient_id INTEGER REFERENCES signature_recipients(id) ON DELETE SET NULL,
      reminder_id INTEGER REFERENCES signature_reminders(id) ON DELETE SET NULL,
      delivery_type VARCHAR(32) NOT NULL
        CHECK (delivery_type IN ('signature_request', 'signature_reminder')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'dead_letter', 'cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      provider_id VARCHAR(255),
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      cancelled_at TIMESTAMP WITH TIME ZONE,
      cancellation_reason VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT signature_delivery_payload_size
        CHECK (octet_length(payload::text) <= 262144)
    );

    CREATE INDEX IF NOT EXISTS idx_signature_delivery_outbox_claim
      ON signature_delivery_outbox(status, next_attempt_at, id)
      WHERE status IN ('queued', 'retry', 'processing');
    CREATE INDEX IF NOT EXISTS idx_signature_delivery_outbox_document
      ON signature_delivery_outbox(document_id, recipient_id, created_at, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_delivery_outbox_reminder
      ON signature_delivery_outbox(reminder_id)
      WHERE reminder_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runSignatureDeliveryMigration };
