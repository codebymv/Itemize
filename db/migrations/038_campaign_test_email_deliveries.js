const {
  runCampaignTestEmailDeliveryMigration,
} = require('../../src/db_campaign_test_email_delivery_migrations');

exports.up = runCampaignTestEmailDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS campaign_test_email_deliveries;
    DROP FUNCTION IF EXISTS enforce_campaign_test_email_delivery_tenant();
  `);
};
