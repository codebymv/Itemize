const {
  runBookingPublicCapabilityMigration,
} = require('../../src/db_booking_public_capability_migrations');

exports.up = runBookingPublicCapabilityMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS idx_bookings_cancellation_token_hash;
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_raw_cancellation_token_forbidden,
      DROP CONSTRAINT IF EXISTS bookings_cancellation_capability_pair,
      DROP COLUMN IF EXISTS cancellation_token_hash,
      DROP COLUMN IF EXISTS cancellation_token_expires_at;
    CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_token
      ON bookings(cancellation_token);
    DROP INDEX IF EXISTS idx_calendars_public_id;
    ALTER TABLE calendars
      DROP CONSTRAINT IF EXISTS calendars_public_id_format,
      DROP COLUMN IF EXISTS public_id;
  `);
};
