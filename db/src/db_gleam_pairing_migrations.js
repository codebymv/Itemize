const runGleamPairingMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gleam_pairing_requests (
      id UUID PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL REFERENCES users(id), code_hash CHAR(64) NOT NULL UNIQUE,
      default_assignee_id INTEGER NOT NULL REFERENCES users(id), due_after_minutes INTEGER NOT NULL CHECK(due_after_minutes BETWEEN 1 AND 43200),
      state TEXT NOT NULL DEFAULT 'unused' CHECK(state IN ('unused','claimed','approved','cancelled')),
      connection_id UUID UNIQUE, source_name VARCHAR(255), encrypted_proof TEXT,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gleam_pairing_org ON gleam_pairing_requests(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS gleam_connection_audit (
      id BIGSERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      connection_id UUID, actor_id INTEGER, action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS gleam_pairing_mutation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL, idempotency_key UUID NOT NULL, fingerprint CHAR(64) NOT NULL, result JSONB NOT NULL,
      PRIMARY KEY(organization_id,actor_id,idempotency_key)
    );
  `);
};
module.exports = { runGleamPairingMigration };
