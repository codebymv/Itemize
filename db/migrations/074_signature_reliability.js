const {
  runSignatureReliabilityMigration,
} = require('../src/db_signature_reliability_migrations');

exports.up = runSignatureReliabilityMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE signature_recipients
      DROP COLUMN IF EXISTS electronic_consented_at,
      DROP COLUMN IF EXISTS electronic_consent_sha256,
      DROP COLUMN IF EXISTS electronic_consent_version;
    ALTER TABLE signature_document_versions DROP COLUMN IF EXISTS page_count;
    ALTER TABLE signature_templates DROP COLUMN IF EXISTS page_count;
    ALTER TABLE signature_documents
      DROP COLUMN IF EXISTS consent_disclosure_sha256,
      DROP COLUMN IF EXISTS consent_disclosure_version,
      DROP COLUMN IF EXISTS page_count;
  `);
};
