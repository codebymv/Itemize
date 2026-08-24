async function runInvoiceEmailDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_email_deliveries (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL
        REFERENCES invoices(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      payment_session_id VARCHAR(255),
      payment_url TEXT,
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
      CONSTRAINT invoice_email_delivery_idempotency
        UNIQUE (organization_id, invoice_id, idempotency_key),
      CONSTRAINT invoice_email_delivery_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_email_deliveries_claim
      ON invoice_email_deliveries(status, next_attempt_at, created_at)
      WHERE status IN ('queued', 'retry', 'processing');

    CREATE INDEX IF NOT EXISTS idx_invoice_email_deliveries_invoice
      ON invoice_email_deliveries(organization_id, invoice_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_email_deliveries_active
      ON invoice_email_deliveries(organization_id, invoice_id)
      WHERE status IN (
        'queued', 'processing', 'retry', 'reconciliation_required'
      );
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_invoice_email_delivery_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM invoices invoice
        WHERE invoice.id = NEW.invoice_id
          AND invoice.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Invoice email delivery must share its invoice organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'invoice_email_delivery_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS invoice_email_delivery_tenant
      ON invoice_email_deliveries;
    CREATE TRIGGER invoice_email_delivery_tenant
      BEFORE INSERT OR UPDATE OF organization_id, invoice_id
      ON invoice_email_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION enforce_invoice_email_delivery_tenant();
  `);

  return true;
}

module.exports = { runInvoiceEmailDeliveryMigration };
