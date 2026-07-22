const {
  runAdminEmailDeliveryMigration,
} = require('../../src/db_admin_email_delivery_migrations');

exports.up = runAdminEmailDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS admin_email_deliveries;
    DROP TABLE IF EXISTS admin_email_batches;
  `);
};
