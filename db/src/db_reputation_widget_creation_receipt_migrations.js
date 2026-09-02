async function runReputationWidgetCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reputation_widget_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_widget_id INTEGER REFERENCES review_widgets(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_reputation_widget_creation_receipts_result
      ON reputation_widget_creation_receipts(organization_id, result_widget_id)
      WHERE result_widget_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runReputationWidgetCreationReceiptMigration };
