const { runCampaignSegmentTargetMigration } = require('../../src/db_campaign_segment_migrations');

exports.up = runCampaignSegmentTargetMigration;

exports.down = async function down(pool) {
    await pool.query('ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_segment_id_fkey');
    await pool.query('DROP INDEX IF EXISTS idx_email_campaigns_segment_id');
    await pool.query('ALTER TABLE email_campaigns DROP COLUMN IF EXISTS segment_id');
};
