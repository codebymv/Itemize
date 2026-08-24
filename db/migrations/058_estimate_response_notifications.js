const {
  runEstimateResponseNotificationMigration,
} = require('../../src/db_estimate_response_notification_migrations');

exports.up = runEstimateResponseNotificationMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS idx_estimate_email_deliveries_type_claim;
    ALTER TABLE estimate_email_deliveries
      DROP CONSTRAINT IF EXISTS estimate_email_delivery_type_check;
    ALTER TABLE estimate_email_deliveries
      DROP CONSTRAINT IF EXISTS estimate_email_delivery_idempotency;
    DELETE FROM estimate_email_deliveries
      WHERE delivery_type <> 'estimate_sent';
    ALTER TABLE estimate_email_deliveries
      ADD CONSTRAINT estimate_email_delivery_idempotency
      UNIQUE (organization_id, estimate_id, idempotency_key);
    ALTER TABLE estimate_email_deliveries
      DROP COLUMN IF EXISTS delivery_type;
  `);
};
