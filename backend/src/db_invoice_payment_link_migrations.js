async function runInvoicePaymentLinkMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_payment_link_intents (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL
        REFERENCES invoices(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      amount_due NUMERIC(12, 2) NOT NULL CHECK (amount_due > 0),
      currency VARCHAR(3) NOT NULL,
      invoice_number VARCHAR(100) NOT NULL,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      status VARCHAR(32) NOT NULL DEFAULT 'processing'
        CHECK (status IN (
          'processing', 'ready', 'rejected', 'reconciliation_required'
        )),
      provider_session_id VARCHAR(255),
      payment_url TEXT,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT invoice_payment_link_intent_idempotency
        UNIQUE (organization_id, invoice_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_payment_link_intents_invoice
      ON invoice_payment_link_intents(
        organization_id, invoice_id, created_at DESC
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payment_link_intents_active
      ON invoice_payment_link_intents(organization_id, invoice_id)
      WHERE status IN ('processing', 'reconciliation_required');
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_invoice_payment_link_intent_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM invoices invoice
        WHERE invoice.id = NEW.invoice_id
          AND invoice.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Payment-link intent must share its invoice organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'invoice_payment_link_intent_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS invoice_payment_link_intent_tenant
      ON invoice_payment_link_intents;
    CREATE TRIGGER invoice_payment_link_intent_tenant
      BEFORE INSERT OR UPDATE OF organization_id, invoice_id
      ON invoice_payment_link_intents
      FOR EACH ROW
      EXECUTE FUNCTION enforce_invoice_payment_link_intent_tenant();
  `);

  return true;
}

module.exports = { runInvoicePaymentLinkMigration };
