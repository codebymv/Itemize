async function runCampaignCreationReceiptMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_creation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      action VARCHAR(16) NOT NULL CHECK (action IN ('create', 'duplicate')),
      request_fingerprint CHAR(64) NOT NULL,
      result_campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_creation_receipts_result
      ON campaign_creation_receipts(organization_id, result_campaign_id)
      WHERE result_campaign_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runCampaignCreationReceiptMigration };
