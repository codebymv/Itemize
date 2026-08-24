const {
  runInvoicePaymentLinkMigration,
} = require('../../src/db_invoice_payment_link_migrations');

exports.up = runInvoicePaymentLinkMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS invoice_payment_link_intents;
    DROP FUNCTION IF EXISTS enforce_invoice_payment_link_intent_tenant();
  `);
};
