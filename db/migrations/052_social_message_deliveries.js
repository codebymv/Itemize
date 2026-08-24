const {
  runSocialMessageDeliveryMigration,
} = require('../../src/db_social_delivery_migrations');

exports.up = runSocialMessageDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS social_message_delivery_jobs');
};
