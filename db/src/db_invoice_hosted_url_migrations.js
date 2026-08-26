async function runInvoiceHostedUrlMigration(pool) {
  await pool.query(`
    ALTER TABLE invoices
      ALTER COLUMN stripe_hosted_invoice_url TYPE TEXT,
      ALTER COLUMN stripe_pdf_url TYPE TEXT;

    UPDATE invoice_email_deliveries
       SET status = 'retry',
           next_attempt_at = CURRENT_TIMESTAMP,
           lease_expires_at = NULL,
           claimed_by = NULL,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE status = 'reconciliation_required'
       AND provider_id IS NULL
       AND payment_url IS NULL
       AND last_error = 'value too long for type character varying(500)';

    UPDATE invoice_payment_link_intents
       SET status = 'rejected',
           last_error = 'Payment link storage was repaired; create the link again.',
           updated_at = CURRENT_TIMESTAMP
     WHERE status = 'reconciliation_required'
       AND provider_session_id IS NULL
       AND payment_url IS NULL
       AND last_error = 'value too long for type character varying(500)';
  `);

  return true;
}

module.exports = { runInvoiceHostedUrlMigration };
