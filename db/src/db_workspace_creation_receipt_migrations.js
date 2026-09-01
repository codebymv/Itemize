async function runWorkspaceCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_creation_receipts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      entity_type VARCHAR(24) NOT NULL
        CHECK (entity_type IN ('list', 'note', 'whiteboard', 'wireframe')),
      request_fingerprint CHAR(64) NOT NULL,
      entity_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (user_id, idempotency_key),
      CONSTRAINT workspace_creation_receipt_completion
        CHECK (
          (entity_id IS NULL AND completed_at IS NULL)
          OR (entity_id IS NOT NULL AND completed_at IS NOT NULL)
        )
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_creation_receipts_entity
      ON workspace_creation_receipts(user_id, entity_type, entity_id)
      WHERE entity_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runWorkspaceCreationReceiptMigration };
