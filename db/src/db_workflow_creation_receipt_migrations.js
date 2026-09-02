async function runWorkflowCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(16) NOT NULL CHECK (action IN ('create', 'duplicate')),
      request_fingerprint CHAR(64) NOT NULL,
      result_workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_creation_receipts_result
      ON workflow_creation_receipts(organization_id, result_workflow_id)
      WHERE result_workflow_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runWorkflowCreationReceiptMigration };
