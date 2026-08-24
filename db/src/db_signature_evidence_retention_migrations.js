async function runSignatureEvidenceRetentionMigration(pool) {
  await pool.query(`
    ALTER TABLE signature_file_deletion_jobs
      DROP CONSTRAINT IF EXISTS signature_file_deletion_jobs_organization_id_fkey;

    COMMENT ON COLUMN signature_file_deletion_jobs.organization_id IS
      'Immutable tenant snapshot; deliberately not a foreign key so cleanup authority survives organization deletion';
  `);
  return true;
}

module.exports = { runSignatureEvidenceRetentionMigration };
