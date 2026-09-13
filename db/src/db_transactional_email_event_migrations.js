async function runTransactionalEmailEventMigration(pool) {
  await pool.query(`
    ALTER TABLE delivery_provider_receipts
      ADD COLUMN IF NOT EXISTS provider_status TEXT,
      ADD COLUMN IF NOT EXISTS provider_status_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_provider_event TEXT;
    ALTER TABLE email_webhook_events
      ADD COLUMN IF NOT EXISTS matched_delivery_source VARCHAR(16),
      ADD COLUMN IF NOT EXISTS matched_delivery_id BIGINT;
    CREATE INDEX IF NOT EXISTS idx_invoice_delivery_provider_id
      ON invoice_email_deliveries(provider_id) WHERE provider_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_signature_delivery_provider_id
      ON signature_delivery_outbox(provider_id) WHERE provider_id IS NOT NULL;
    WITH candidates AS (
      SELECT organization_id,'invoice'::text AS source,id AS delivery_id,
        'invoice-email:' || organization_id || ':' || id AS idempotency_key,
        provider_id,created_at FROM invoice_email_deliveries WHERE provider_id IS NOT NULL
      UNION ALL
      SELECT organization_id,'signature',id,idempotency_key,provider_id,created_at
        FROM signature_delivery_outbox WHERE provider_id IS NOT NULL
    ), ranked AS (
      SELECT candidates.*,COUNT(*) OVER (PARTITION BY provider_id) AS provider_matches FROM candidates
    )
    INSERT INTO delivery_provider_receipts
      (organization_id,source,delivery_id,idempotency_key,provider_id,first_attempt_at)
      SELECT organization_id,source,delivery_id,idempotency_key,provider_id,created_at
      FROM ranked WHERE provider_matches=1
      ON CONFLICT DO NOTHING;
    UPDATE email_webhook_events event SET reconciliation_status='retry',
      reconciliation_next_attempt_at=CURRENT_TIMESTAMP
      WHERE processing_status='pending' AND reconciliation_status IN ('pending','retry','dead_letter')
        AND EXISTS (SELECT 1 FROM delivery_provider_receipts receipt WHERE receipt.provider_id=event.external_id);
  `);
  return true;
}
module.exports = { runTransactionalEmailEventMigration };
