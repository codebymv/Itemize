async function runSignatureDeliveryActionReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_delivery_action_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(20) NOT NULL CHECK (action IN ('send', 'remind', 'retry')),
      request_fingerprint CHAR(64) NOT NULL,
      result_document_id INTEGER REFERENCES signature_documents(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_signature_delivery_action_receipts_document
      ON signature_delivery_action_receipts(organization_id, result_document_id)
      WHERE result_document_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runSignatureDeliveryActionReceiptMigration };
