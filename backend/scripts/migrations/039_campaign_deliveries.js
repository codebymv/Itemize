const { runCampaignDeliveryMigration } = require('../../src/db_campaign_delivery_migrations');

exports.up = runCampaignDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TRIGGER IF EXISTS campaign_recipient_delivery_job_tenant ON campaign_recipients;
    DROP FUNCTION IF EXISTS enforce_campaign_recipient_delivery_job_tenant();
    ALTER TABLE campaign_recipients
      DROP COLUMN IF EXISTS delivery_claimed_by,
      DROP COLUMN IF EXISTS delivery_lease_expires_at,
      DROP COLUMN IF EXISTS delivery_next_attempt_at,
      DROP COLUMN IF EXISTS delivery_attempt_count,
      DROP COLUMN IF EXISTS delivery_status,
      DROP COLUMN IF EXISTS delivery_job_id;
    DROP TABLE IF EXISTS campaign_delivery_jobs;
    DROP FUNCTION IF EXISTS enforce_campaign_delivery_tenant();
  `);
};
