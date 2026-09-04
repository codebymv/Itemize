async function runProductCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_product_creation_receipts_result
      ON product_creation_receipts(organization_id, result_product_id)
      WHERE result_product_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runProductCreationReceiptMigration };
