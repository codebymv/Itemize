const {
  runCalendarSyncJobMigration,
} = require('../../src/db_calendar_sync_job_migrations');

exports.up = runCalendarSyncJobMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS idx_calendar_sync_events_booking;
    DROP TABLE IF EXISTS calendar_sync_jobs;
    DROP FUNCTION IF EXISTS enforce_calendar_sync_job_tenant();
  `);
};
