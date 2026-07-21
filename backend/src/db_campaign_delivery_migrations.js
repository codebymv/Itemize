async function runCampaignDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_delivery_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'reconciliation_required')),
      recipient_count INTEGER NOT NULL CHECK (recipient_count > 0),
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT campaign_delivery_job_idempotency
        UNIQUE (organization_id, idempotency_key),
      CONSTRAINT campaign_delivery_job_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
    );

    ALTER TABLE campaign_recipients
      ADD COLUMN IF NOT EXISTS delivery_job_id BIGINT
        REFERENCES campaign_delivery_jobs(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(32) NOT NULL DEFAULT 'queued',
      ADD COLUMN IF NOT EXISTS delivery_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_next_attempt_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivery_lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS delivery_claimed_by VARCHAR(255);

    DO $constraints$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'campaign_recipient_delivery_status_check'
      ) THEN
        ALTER TABLE campaign_recipients
          ADD CONSTRAINT campaign_recipient_delivery_status_check
          CHECK (delivery_status IN (
            'queued', 'processing', 'retry', 'sent', 'dead_letter',
            'reconciliation_required'
          ));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'campaign_recipient_delivery_attempt_count_check'
      ) THEN
        ALTER TABLE campaign_recipients
          ADD CONSTRAINT campaign_recipient_delivery_attempt_count_check
          CHECK (delivery_attempt_count >= 0);
      END IF;
    END
    $constraints$;

    CREATE INDEX IF NOT EXISTS idx_campaign_delivery_jobs_campaign
      ON campaign_delivery_jobs(organization_id, campaign_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_campaign_recipients_delivery_claim
      ON campaign_recipients(delivery_status, delivery_next_attempt_at, id)
      WHERE delivery_status IN ('queued', 'retry', 'processing');
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_campaign_delivery_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM email_campaigns campaign
        WHERE campaign.id = NEW.campaign_id
          AND campaign.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Campaign delivery job must share its campaign organization'
          USING ERRCODE = '23514', CONSTRAINT = 'campaign_delivery_job_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS campaign_delivery_job_tenant ON campaign_delivery_jobs;
    CREATE TRIGGER campaign_delivery_job_tenant
      BEFORE INSERT OR UPDATE OF organization_id, campaign_id
      ON campaign_delivery_jobs
      FOR EACH ROW EXECUTE FUNCTION enforce_campaign_delivery_tenant();

    CREATE OR REPLACE FUNCTION enforce_campaign_recipient_delivery_job_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NEW.delivery_job_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM campaign_delivery_jobs job
        WHERE job.id = NEW.delivery_job_id
          AND job.campaign_id = NEW.campaign_id
          AND job.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Campaign recipient delivery must share its job tenant and campaign'
          USING ERRCODE = '23514', CONSTRAINT = 'campaign_recipient_delivery_job_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS campaign_recipient_delivery_job_tenant ON campaign_recipients;
    CREATE TRIGGER campaign_recipient_delivery_job_tenant
      BEFORE INSERT OR UPDATE OF organization_id, campaign_id, delivery_job_id
      ON campaign_recipients
      FOR EACH ROW EXECUTE FUNCTION enforce_campaign_recipient_delivery_job_tenant();
  `);
  return true;
}

module.exports = { runCampaignDeliveryMigration };
