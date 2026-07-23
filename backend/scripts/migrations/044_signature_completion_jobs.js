const {
  runSignatureCompletionMigration,
} = require('../../src/db_signature_completion_migrations');

exports.up = runSignatureCompletionMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS signature_completion_jobs;
    DELETE FROM signature_delivery_outbox
    WHERE delivery_type IN ('signer_completed', 'document_completed', 'signature_declined');
    ALTER TABLE signature_delivery_outbox
      DROP CONSTRAINT IF EXISTS signature_delivery_outbox_delivery_type_check;
    ALTER TABLE signature_delivery_outbox
      ADD CONSTRAINT signature_delivery_outbox_delivery_type_check
      CHECK (delivery_type IN ('signature_request', 'signature_reminder'));
  `);
};
