async function runBookingIdempotencyMigration(pool) {
  await pool.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
      ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

    DO $$
    BEGIN
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_idempotency_pair
        CHECK (
          (idempotency_key IS NULL AND request_fingerprint IS NULL)
          OR (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
        );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_public_idempotency
      ON bookings(calendar_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  return true;
}

module.exports = { runBookingIdempotencyMigration };
