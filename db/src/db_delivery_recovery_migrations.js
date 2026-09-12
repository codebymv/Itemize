async function runDeliveryRecoveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_provider_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source VARCHAR(16) NOT NULL CHECK (source IN ('invoice','signature')),
      delivery_id BIGINT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      request_body TEXT,
      first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      provider_id TEXT UNIQUE,
      review_required BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (source, delivery_id)
    );
    CREATE TABLE IF NOT EXISTS delivery_reconciliation_audit (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source VARCHAR(16) NOT NULL,
      delivery_id BIGINT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE signature_delivery_outbox ADD COLUMN IF NOT EXISTS claim_generation BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE signature_completion_jobs ADD COLUMN IF NOT EXISTS claim_generation BIGINT NOT NULL DEFAULT 0;
    INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,first_attempt_at,review_required)
      SELECT organization_id,'invoice',id,'invoice-email:' || organization_id || ':' || id,created_at,true
      FROM invoice_email_deliveries WHERE (attempt_count>0 OR status<>'queued') AND status<>'sent'
      ON CONFLICT DO NOTHING;
    INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,first_attempt_at,review_required)
      SELECT organization_id,'signature',id,idempotency_key,created_at,true
      FROM signature_delivery_outbox WHERE (attempt_count>0 OR status<>'queued') AND status NOT IN ('sent','cancelled')
      ON CONFLICT DO NOTHING;
  `);
  return true;
}
module.exports={runDeliveryRecoveryMigration};
