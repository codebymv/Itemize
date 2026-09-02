async function runEmailTemplateCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_template_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(24) NOT NULL CHECK (action IN ('create', 'create_draft', 'duplicate')),
      request_fingerprint CHAR(64) NOT NULL,
      result_template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_email_template_creation_receipts_result
      ON email_template_creation_receipts(organization_id, result_template_id)
      WHERE result_template_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runEmailTemplateCreationReceiptMigration };
