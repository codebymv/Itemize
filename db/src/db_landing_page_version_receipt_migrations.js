async function runLandingPageVersionReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landing_page_version_mutation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(16) NOT NULL
        CHECK (action IN ('create', 'publish', 'restore')),
      request_fingerprint CHAR(64) NOT NULL,
      result_version_id INTEGER REFERENCES page_versions(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, page_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_landing_page_version_receipts_result
      ON landing_page_version_mutation_receipts(
        organization_id, page_id, result_version_id
      )
      WHERE result_version_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runLandingPageVersionReceiptMigration };
