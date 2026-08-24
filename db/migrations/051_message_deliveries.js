const {
  runMessageDeliveryMigration,
} = require('../../src/db_message_delivery_migrations');

exports.up = runMessageDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS message_delivery_jobs');
};
