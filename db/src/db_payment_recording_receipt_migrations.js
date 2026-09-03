async function runPaymentRecordingReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_recording_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_payment_recording_receipts_result
      ON payment_recording_receipts(organization_id, result_payment_id)
      WHERE result_payment_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runPaymentRecordingReceiptMigration };
