async function runPublicFormSubmissionIdempotencyMigration(pool) {
  await pool.query(`
    ALTER TABLE form_submissions
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
      ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

    DO $$
    BEGIN
      ALTER TABLE form_submissions
        ADD CONSTRAINT form_submission_idempotency_pair
        CHECK (
          (idempotency_key IS NULL AND request_fingerprint IS NULL)
          OR (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
        );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_form_submissions_idempotency
      ON form_submissions(form_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  return true;
}

module.exports = { runPublicFormSubmissionIdempotencyMigration };
