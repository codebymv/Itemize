async function runContactImportReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_import_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      imported INTEGER,
      skipped INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (organization_id, requested_by_user_id, idempotency_key),
      CONSTRAINT contact_import_receipt_result_nonnegative
        CHECK (
          (imported IS NULL OR imported >= 0)
          AND (skipped IS NULL OR skipped >= 0)
        ),
      CONSTRAINT contact_import_receipt_completion_pair
        CHECK (
          (imported IS NULL AND skipped IS NULL AND completed_at IS NULL)
          OR (imported IS NOT NULL AND skipped IS NOT NULL AND completed_at IS NOT NULL)
        )
    );

    CREATE INDEX IF NOT EXISTS idx_contact_import_receipts_created_at
      ON contact_import_receipts(created_at);
  `);
  return true;
}

module.exports = { runContactImportReceiptMigration };
