const {
  runInvoiceLogoDeletionMigration,
} = require('../../src/db_invoice_logo_deletion_migrations');

exports.up = runInvoiceLogoDeletionMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS invoice_logo_deletion_jobs;
    DROP FUNCTION IF EXISTS enforce_invoice_logo_deletion_tenant();
  `);
};
