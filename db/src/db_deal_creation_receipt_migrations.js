async function runDealCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deal_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_deal_creation_receipts_result
      ON deal_creation_receipts(organization_id, result_deal_id)
      WHERE result_deal_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runDealCreationReceiptMigration };
