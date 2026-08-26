async function runInvoicePaymentResultMigration(pool) {
  await pool.query(`
    ALTER TABLE invoice_payment_link_intents
      DROP CONSTRAINT IF EXISTS invoice_payment_link_intents_status_check;
    ALTER TABLE invoice_payment_link_intents
      ADD CONSTRAINT invoice_payment_link_intents_status_check
      CHECK (status IN (
        'processing', 'ready', 'paid', 'refunded', 'rejected',
        'reconciliation_required'
      ));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payment_link_provider_session
      ON invoice_payment_link_intents(provider_session_id)
      WHERE provider_session_id IS NOT NULL;
  `);
  return true;
}

module.exports = { runInvoicePaymentResultMigration };
