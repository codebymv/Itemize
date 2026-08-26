const {
  runInvoicePaymentUrlMigration,
} = require('../../src/db_invoice_payment_url_migrations');

exports.up = runInvoicePaymentUrlMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE invoice_email_deliveries
      ALTER COLUMN payment_url TYPE VARCHAR(500);

    ALTER TABLE invoice_payment_link_intents
      ALTER COLUMN payment_url TYPE VARCHAR(500);
  `);
};
