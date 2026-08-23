const {
  runRealtimeOutboxExpirationMigration,
} = require('../../src/db_realtime_outbox_migrations');

exports.up = runRealtimeOutboxExpirationMigration;
