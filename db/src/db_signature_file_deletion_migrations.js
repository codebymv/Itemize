async function runSignatureFileDeletionMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_file_deletion_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      document_id INTEGER,
      file_url TEXT NOT NULL CHECK (length(file_url) BETWEEN 1 AND 2048),
      status VARCHAR(16) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'deleted', 'dead_letter')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      last_error TEXT,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT signature_file_deletion_identity
        UNIQUE (organization_id, file_url)
    );

    CREATE INDEX IF NOT EXISTS idx_signature_file_deletion_jobs_claim
      ON signature_file_deletion_jobs(status, next_attempt_at, id)
      WHERE status IN ('queued', 'processing', 'retry');
  `);
  return true;
}

module.exports = { runSignatureFileDeletionMigration };
