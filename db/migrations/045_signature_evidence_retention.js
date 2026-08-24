const {
  runSignatureEvidenceRetentionMigration,
} = require('../../src/db_signature_evidence_retention_migrations');

exports.up = runSignatureEvidenceRetentionMigration;

exports.down = async (pool) => {
  await pool.query(`
    ALTER TABLE signature_file_deletion_jobs
      ADD CONSTRAINT signature_file_deletion_jobs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON DELETE CASCADE NOT VALID;
  `);
};
