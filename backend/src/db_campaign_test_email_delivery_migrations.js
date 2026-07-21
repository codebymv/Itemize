async function runCampaignTestEmailDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_test_email_deliveries (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id INTEGER NOT NULL
        REFERENCES email_campaigns(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      recipient_email VARCHAR(254) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'processing', 'retry', 'sent', 'dead_letter',
          'reconciliation_required'
        )),
      attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_id VARCHAR(255),
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT campaign_test_email_delivery_idempotency
        UNIQUE (organization_id, campaign_id, idempotency_key),
      CONSTRAINT campaign_test_email_delivery_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_test_email_deliveries_claim
      ON campaign_test_email_deliveries(status, next_attempt_at, created_at)
      WHERE status IN ('queued', 'retry', 'processing');

    CREATE INDEX IF NOT EXISTS idx_campaign_test_email_deliveries_campaign
      ON campaign_test_email_deliveries(organization_id, campaign_id, created_at DESC);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_campaign_test_email_delivery_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM email_campaigns campaign
        WHERE campaign.id = NEW.campaign_id
          AND campaign.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Campaign test email delivery must share its campaign organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'campaign_test_email_delivery_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS campaign_test_email_delivery_tenant
      ON campaign_test_email_deliveries;
    CREATE TRIGGER campaign_test_email_delivery_tenant
      BEFORE INSERT OR UPDATE OF organization_id, campaign_id
      ON campaign_test_email_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION enforce_campaign_test_email_delivery_tenant();
  `);

  return true;
}

module.exports = { runCampaignTestEmailDeliveryMigration };
