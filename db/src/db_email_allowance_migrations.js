async function runEmailAllowanceMigration(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS email_usage_reservations (
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source VARCHAR(32) NOT NULL,
    source_id BIGINT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, source, source_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_usage_month
    ON email_usage_reservations (organization_id, reserved_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_email_usage_source
    ON message_delivery_jobs (organization_id,created_at) WHERE kind='contact_email'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaign_email_usage_source
    ON campaign_delivery_jobs (organization_id,created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_workflow_email_usage_source
    ON workflow_side_effect_outbox (organization_id,(COALESCE(sent_at,created_at)))
    WHERE effect_type='email' AND idempotency_key LIKE 'workflow-%' AND attempt_count>0`);
  return true;
}
module.exports = { runEmailAllowanceMigration };
