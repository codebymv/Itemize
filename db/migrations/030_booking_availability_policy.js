const {
  runBookingAvailabilityPolicyMigration,
} = require('../../src/db_booking_availability_policy_migrations');

exports.up = runBookingAvailabilityPolicyMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP FUNCTION IF EXISTS booking_available_slots(
      INTEGER, DATE, DATE, TIMESTAMP WITH TIME ZONE
    );
    DROP FUNCTION IF EXISTS booking_slot_policy_reason(
      INTEGER,
      TIMESTAMP WITH TIME ZONE,
      TIMESTAMP WITH TIME ZONE,
      INTEGER,
      BOOLEAN,
      TIMESTAMP WITH TIME ZONE
    );
    DROP TABLE IF EXISTS calendar_external_busy_intervals;
    DROP FUNCTION IF EXISTS enforce_calendar_external_busy_tenant();
  `);
};
