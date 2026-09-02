async function runSignatureCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(40) NOT NULL CHECK (action IN (
        'create_document',
        'create_template',
        'instantiate_template'
      )),
      request_fingerprint CHAR(64) NOT NULL,
      result_document_id INTEGER REFERENCES signature_documents(id) ON DELETE SET NULL,
      result_template_id INTEGER REFERENCES signature_templates(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_signature_creation_receipts_document
      ON signature_creation_receipts(organization_id, result_document_id)
      WHERE result_document_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_signature_creation_receipts_template
      ON signature_creation_receipts(organization_id, result_template_id)
      WHERE result_template_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runSignatureCreationReceiptMigration };
