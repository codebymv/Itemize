const {
  runSignatureDeliveryMigration,
} = require('../../src/db_signature_delivery_migrations');

exports.up = runSignatureDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS signature_delivery_outbox');
};
