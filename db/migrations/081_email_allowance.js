const { runEmailAllowanceMigration } = require('../src/db_email_allowance_migrations');
exports.up = runEmailAllowanceMigration;
// Usage is financial history: rollback keeps the additive table.
exports.down = async () => {};
