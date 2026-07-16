async function runCampaignSegmentTargetMigration(pool) {
    await pool.query(`
        ALTER TABLE email_campaigns
        ADD COLUMN IF NOT EXISTS segment_id INTEGER
    `);
    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'email_campaigns_segment_id_fkey'
                  AND conrelid = 'email_campaigns'::regclass
            ) THEN
                ALTER TABLE email_campaigns
                ADD CONSTRAINT email_campaigns_segment_id_fkey
                FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE RESTRICT;
            END IF;
        END $$
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_email_campaigns_segment_id
        ON email_campaigns(segment_id) WHERE segment_id IS NOT NULL
    `);
    return true;
}

module.exports = { runCampaignSegmentTargetMigration };
