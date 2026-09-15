const { runGleamNotificationMigration } = require('../src/db_gleam_notification_migrations');
exports.up = runGleamNotificationMigration;
exports.down = async () => {}; // Retain notification deduplication evidence.
