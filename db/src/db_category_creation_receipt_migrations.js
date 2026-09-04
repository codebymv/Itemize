async function runCategoryCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_creation_receipts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_category_creation_receipts_result
      ON category_creation_receipts(user_id, result_category_id)
      WHERE result_category_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runCategoryCreationReceiptMigration };
