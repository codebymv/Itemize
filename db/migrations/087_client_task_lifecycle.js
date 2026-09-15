const { runClientTaskLifecycleMigration } = require('../src/db_client_task_migrations');
exports.up = runClientTaskLifecycleMigration;
// Preserve tasks, replay receipts and audit evidence on application rollback.
exports.down = async () => {};
