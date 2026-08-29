const runSignatureReliabilityMigration = async (pool) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE signature_documents
        ADD COLUMN IF NOT EXISTS page_count INTEGER,
        ADD COLUMN IF NOT EXISTS consent_disclosure_version VARCHAR(100),
        ADD COLUMN IF NOT EXISTS consent_disclosure_sha256 VARCHAR(64);

      ALTER TABLE signature_templates
        ADD COLUMN IF NOT EXISTS page_count INTEGER;

      ALTER TABLE signature_document_versions
        ADD COLUMN IF NOT EXISTS page_count INTEGER;

      ALTER TABLE signature_recipients
        ADD COLUMN IF NOT EXISTS electronic_consent_version VARCHAR(100),
        ADD COLUMN IF NOT EXISTS electronic_consent_sha256 VARCHAR(64),
        ADD COLUMN IF NOT EXISTS electronic_consented_at TIMESTAMP WITH TIME ZONE;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'signature_documents_page_count_check'
            AND conrelid = 'signature_documents'::regclass
        ) THEN
          ALTER TABLE signature_documents
            ADD CONSTRAINT signature_documents_page_count_check
            CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 200);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'signature_templates_page_count_check'
            AND conrelid = 'signature_templates'::regclass
        ) THEN
          ALTER TABLE signature_templates
            ADD CONSTRAINT signature_templates_page_count_check
            CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 200);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'signature_document_versions_page_count_check'
            AND conrelid = 'signature_document_versions'::regclass
        ) THEN
          ALTER TABLE signature_document_versions
            ADD CONSTRAINT signature_document_versions_page_count_check
            CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 200);
        END IF;
      END $$;
    `);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signature reliability migration failed:', error.message);
    return false;
  } finally {
    client.release();
  }
};

module.exports = { runSignatureReliabilityMigration };
