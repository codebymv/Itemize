async function runOrganizationLifecycleReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_lifecycle_mutation_receipts (
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      organization_id INTEGER NOT NULL,
      action VARCHAR(48) NOT NULL CHECK (action IN (
        'delete_organization',
        'leave_organization',
        'remove_member',
        'revoke_invitation',
        'transfer_ownership',
        'update_member_role'
      )),
      request_fingerprint CHAR(64) NOT NULL,
      result JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requested_by_user_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_organization_lifecycle_receipts_org
      ON organization_lifecycle_mutation_receipts(organization_id, created_at DESC);
  `);
  return true;
}

module.exports = { runOrganizationLifecycleReceiptMigration };
