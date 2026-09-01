async function runEmailTemplatePublishReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_template_publish_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      published_version_id BIGINT REFERENCES email_template_versions(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (organization_id, template_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_email_template_publish_receipts_version
      ON email_template_publish_receipts(organization_id, template_id, published_version_id)
      WHERE published_version_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runEmailTemplatePublishReceiptMigration };
