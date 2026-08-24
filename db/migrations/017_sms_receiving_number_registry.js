const {
  runSmsReceivingNumberRegistryMigration,
} = require('../../src/db_sms_webhook_migrations');

exports.up = runSmsReceivingNumberRegistryMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_sms_webhook_events_routing_status');
  await pool.query(`
    ALTER TABLE sms_webhook_events
      DROP CONSTRAINT IF EXISTS sms_webhook_events_processing_status_check,
      DROP COLUMN IF EXISTS processing_status,
      DROP COLUMN IF EXISTS from_phone,
      DROP COLUMN IF EXISTS to_phone,
      DROP COLUMN IF EXISTS contact_id,
      DROP COLUMN IF EXISTS organization_id
  `);
  await pool.query('DROP TABLE IF EXISTS sms_receiving_numbers');
};
