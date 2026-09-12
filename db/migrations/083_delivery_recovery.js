const { runDeliveryRecoveryMigration } = require('../src/db_delivery_recovery_migrations');
exports.up = runDeliveryRecoveryMigration;
// Preserve provider receipts and audit history on rollback.
exports.down = async () => {};
