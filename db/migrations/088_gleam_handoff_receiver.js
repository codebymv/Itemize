const { runGleamHandoffReceiverMigration } = require('../src/db_gleam_handoff_receiver_migrations');
exports.up = runGleamHandoffReceiverMigration;
// Retain grants, source tombstones and application receipts on rollback.
exports.down = async () => {};
