const {
  runInvoiceHostedUrlMigration,
} = require('../../src/db_invoice_hosted_url_migrations');

exports.up = runInvoiceHostedUrlMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE invoices
      ALTER COLUMN stripe_hosted_invoice_url TYPE VARCHAR(500),
      ALTER COLUMN stripe_pdf_url TYPE VARCHAR(500);
  `);
};
