const {
  runEstimateEmailDeliveryMigration,
} = require('../../src/db_estimate_email_delivery_migrations');

exports.up = runEstimateEmailDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS estimate_email_deliveries;
    DROP FUNCTION IF EXISTS enforce_estimate_email_delivery_tenant();
  `);
};
