const {
  runSharedRevocationRealtimeOutboxMigration,
  runWireframeRealtimeOutboxMigration,
} = require('../../src/db_realtime_outbox_migrations');

exports.up = runSharedRevocationRealtimeOutboxMigration;
exports.down = runWireframeRealtimeOutboxMigration;
