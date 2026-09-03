async function runOrganizationMutationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_creation_receipts (
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      result_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requested_by_user_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_organization_creation_receipts_result
      ON organization_creation_receipts(requested_by_user_id, result_organization_id)
      WHERE result_organization_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS organization_invitation_mutation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(32) NOT NULL CHECK (action IN ('create', 'resend')),
      request_fingerprint CHAR(64) NOT NULL,
      result_invitation_id INTEGER REFERENCES organization_invitations(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_organization_invitation_receipts_result
      ON organization_invitation_mutation_receipts(organization_id, result_invitation_id)
      WHERE result_invitation_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runOrganizationMutationReceiptMigration };
