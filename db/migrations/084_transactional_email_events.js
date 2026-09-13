const { runTransactionalEmailEventMigration } = require('../src/db_transactional_email_event_migrations');
exports.up = runTransactionalEmailEventMigration;
// Preserve provider event history on code rollback.
exports.down = async () => {};
