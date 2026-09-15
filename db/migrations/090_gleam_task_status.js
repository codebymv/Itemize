const { runGleamTaskStatusMigration } = require('../src/db_gleam_task_status_migrations');
exports.up = runGleamTaskStatusMigration;
exports.down = async () => {}; // Retain monotonic task versions.
