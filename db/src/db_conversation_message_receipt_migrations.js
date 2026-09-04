async function runConversationMessageReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_message_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_conversation_message_receipts_result
      ON conversation_message_receipts(organization_id, result_message_id)
      WHERE result_message_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runConversationMessageReceiptMigration };
