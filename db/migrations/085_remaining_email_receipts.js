const { runRemainingEmailReceiptMigration } = require('../src/db_remaining_email_receipt_migrations');
exports.up = runRemainingEmailReceiptMigration;
// Preserve send evidence and encrypted snapshots on rollback.
exports.down = async () => {};
