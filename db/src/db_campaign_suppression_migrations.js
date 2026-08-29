async function runCampaignSuppressionMigration(pool) {
  await pool.query(`
    ALTER TABLE campaign_recipients
      ADD COLUMN IF NOT EXISTS suppression_reason VARCHAR(32),
      ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMP WITH TIME ZONE;

    ALTER TABLE campaign_recipients
      DROP CONSTRAINT IF EXISTS campaign_recipient_delivery_status_check;

    ALTER TABLE campaign_recipients
      ADD CONSTRAINT campaign_recipient_delivery_status_check
      CHECK (delivery_status IN (
        'queued', 'processing', 'retry', 'sent', 'dead_letter',
        'reconciliation_required', 'suppressed'
      ));

    CREATE INDEX IF NOT EXISTS idx_campaign_recipients_suppressed
      ON campaign_recipients(organization_id, suppressed_at DESC)
      WHERE delivery_status='suppressed';
  `);
  return true;
}

module.exports = { runCampaignSuppressionMigration };
