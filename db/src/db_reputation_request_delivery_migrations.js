async function runReputationRequestDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_request_delivery_batches (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      operation VARCHAR(16) NOT NULL
        CHECK (operation IN ('send', 'bulk', 'resend')),
      input_fingerprint CHAR(64) NOT NULL
        CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'processing', 'sent', 'failed',
          'reconciliation_required'
        )),
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT review_request_delivery_batch_idempotency
        UNIQUE (organization_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS review_request_deliveries (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL
        REFERENCES review_request_delivery_batches(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      review_request_id INTEGER NOT NULL
        REFERENCES review_requests(id) ON DELETE CASCADE,
      channel VARCHAR(8) NOT NULL CHECK (channel IN ('email', 'sms')),
      recipient VARCHAR(512) NOT NULL,
      subject VARCHAR(255),
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'processing', 'retry', 'sent', 'dead_letter',
          'reconciliation_required'
        )),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_id VARCHAR(255),
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT review_request_delivery_item
        UNIQUE (batch_id, review_request_id, channel),
      CONSTRAINT review_request_delivery_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
    );

    CREATE INDEX IF NOT EXISTS idx_review_request_deliveries_claim
      ON review_request_deliveries(status, next_attempt_at, created_at)
      WHERE status IN ('queued', 'retry', 'processing');

    CREATE INDEX IF NOT EXISTS idx_review_request_deliveries_request
      ON review_request_deliveries(organization_id, review_request_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_request_deliveries_active_channel
      ON review_request_deliveries(organization_id, review_request_id, channel)
      WHERE status IN ('queued', 'processing', 'retry', 'reconciliation_required');
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_review_request_delivery_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM review_request_delivery_batches batch
        WHERE batch.id = NEW.batch_id
          AND batch.organization_id = NEW.organization_id
      ) OR NOT EXISTS (
        SELECT 1 FROM review_requests request
        WHERE request.id = NEW.review_request_id
          AND request.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Review request delivery must share its batch and request organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'review_request_delivery_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS review_request_delivery_tenant
      ON review_request_deliveries;
    CREATE TRIGGER review_request_delivery_tenant
      BEFORE INSERT OR UPDATE OF batch_id, organization_id, review_request_id
      ON review_request_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION enforce_review_request_delivery_tenant();

    CREATE OR REPLACE FUNCTION prevent_active_review_request_delivery_delete()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $active$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM review_request_deliveries delivery
        WHERE delivery.review_request_id = OLD.id
          AND delivery.organization_id = OLD.organization_id
          AND delivery.status IN ('queued', 'processing', 'retry', 'reconciliation_required')
      ) THEN
        RAISE EXCEPTION 'Review request has an unresolved delivery'
          USING ERRCODE = '23514',
                CONSTRAINT = 'review_request_active_delivery';
      END IF;
      RETURN OLD;
    END
    $active$;

    DROP TRIGGER IF EXISTS review_request_active_delivery_delete
      ON review_requests;
    CREATE TRIGGER review_request_active_delivery_delete
      BEFORE DELETE ON review_requests
      FOR EACH ROW
      EXECUTE FUNCTION prevent_active_review_request_delivery_delete();
  `);

  return true;
}

module.exports = { runReputationRequestDeliveryMigration };
