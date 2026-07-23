const {
  runSignatureFileDeletionMigration,
} = require('../../src/db_signature_file_deletion_migrations');

exports.up = runSignatureFileDeletionMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS signature_file_deletion_jobs');
};
