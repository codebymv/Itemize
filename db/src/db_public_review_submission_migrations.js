async function runPublicReviewSubmissionMigration(pool) {
  await pool.query(`
    ALTER TABLE review_requests
      ADD COLUMN IF NOT EXISTS submission_fingerprint CHAR(64);
  `);
  return true;
}

module.exports = { runPublicReviewSubmissionMigration };
