const {
  runReputationRequestDeliveryMigration,
} = require('../../src/db_reputation_request_delivery_migrations');

exports.up = runReputationRequestDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TRIGGER IF EXISTS review_request_active_delivery_delete ON review_requests;
    DROP FUNCTION IF EXISTS prevent_active_review_request_delivery_delete();
    DROP TRIGGER IF EXISTS review_request_delivery_tenant ON review_request_deliveries;
    DROP FUNCTION IF EXISTS enforce_review_request_delivery_tenant();
    DROP TABLE IF EXISTS review_request_deliveries;
    DROP TABLE IF EXISTS review_request_delivery_batches;
  `);
};
