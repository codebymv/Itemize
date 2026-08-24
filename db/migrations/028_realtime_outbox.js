const {
  runRealtimeOutboxMigration,
} = require('../../src/db_realtime_outbox_migrations');

exports.up = runRealtimeOutboxMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS realtime_event_outbox');
};
