const {
  runInvoiceEmailDeliveryMigration,
} = require('../../src/db_invoice_email_delivery_migrations');

exports.up = runInvoiceEmailDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS invoice_email_deliveries;
    DROP FUNCTION IF EXISTS enforce_invoice_email_delivery_tenant();
  `);
};
