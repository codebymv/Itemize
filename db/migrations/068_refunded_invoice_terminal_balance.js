const {
  runRefundedInvoiceTerminalBalanceMigration,
} = require('../src/db_payment_refund_migrations');

exports.up = runRefundedInvoiceTerminalBalanceMigration;

exports.down = async function down() {
  // Historical invoice balances cannot be reconstructed safely from the
  // terminal aggregate alone. Payment and refund ledgers remain unchanged.
};
