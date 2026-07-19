async function runBookingPublicCapabilityMigration(pool) {
  const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
  await client.query('BEGIN');
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query('LOCK TABLE calendars IN SHARE ROW EXCLUSIVE MODE');
    await client.query('LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE');

    await client.query(`
      ALTER TABLE calendars
      ADD COLUMN IF NOT EXISTS public_id VARCHAR(36)
    `);
    await client.query(`
      WITH ranked AS (
        SELECT id,
               public_id,
               ROW_NUMBER() OVER (PARTITION BY public_id ORDER BY id) AS duplicate_rank
        FROM calendars
      )
      UPDATE calendars AS calendar
      SET public_id = 'cal_' || encode(gen_random_bytes(16), 'hex')
      FROM ranked
      WHERE calendar.id = ranked.id
        AND (
          ranked.public_id IS NULL
          OR ranked.public_id !~ '^cal_[a-f0-9]{32}$'
          OR ranked.duplicate_rank > 1
        )
    `);
    await client.query(`
      ALTER TABLE calendars
      ALTER COLUMN public_id
      SET DEFAULT ('cal_' || encode(gen_random_bytes(16), 'hex'))
    `);
    await client.query(`
      ALTER TABLE calendars
      ALTER COLUMN public_id SET NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_calendars_public_id
      ON calendars(public_id)
    `);
    await client.query(`
      ALTER TABLE calendars
      DROP CONSTRAINT IF EXISTS calendars_public_id_format
    `);
    await client.query(`
      ALTER TABLE calendars
      ADD CONSTRAINT calendars_public_id_format
      CHECK (public_id ~ '^cal_[a-f0-9]{32}$')
    `);

    await client.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS cancellation_token_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cancellation_token_expires_at TIMESTAMP WITH TIME ZONE
    `);
    await client.query(`
      UPDATE bookings
      SET cancellation_token_hash = CASE
            WHEN cancellation_token IS NOT NULL
             AND status = 'confirmed'
             AND end_time + INTERVAL '1 day' > CURRENT_TIMESTAMP
              THEN encode(digest(cancellation_token, 'sha256'), 'hex')
            WHEN cancellation_token IS NULL
             AND cancellation_token_hash ~ '^[a-f0-9]{64}$'
             AND cancellation_token_expires_at > CURRENT_TIMESTAMP
              THEN cancellation_token_hash
            ELSE NULL
          END,
          cancellation_token_expires_at = CASE
            WHEN cancellation_token IS NOT NULL
             AND status = 'confirmed'
             AND end_time + INTERVAL '1 day' > CURRENT_TIMESTAMP
              THEN end_time + INTERVAL '1 day'
            WHEN cancellation_token IS NULL
             AND cancellation_token_hash ~ '^[a-f0-9]{64}$'
             AND cancellation_token_expires_at > CURRENT_TIMESTAMP
              THEN cancellation_token_expires_at
            ELSE NULL
          END,
          cancellation_token = NULL
    `);
    await client.query(`
      WITH duplicate_capabilities AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY cancellation_token_hash
                 ORDER BY id
               ) AS duplicate_rank
        FROM bookings
        WHERE cancellation_token_hash IS NOT NULL
      )
      UPDATE bookings AS booking
      SET cancellation_token_hash = NULL,
          cancellation_token_expires_at = NULL
      FROM duplicate_capabilities
      WHERE booking.id = duplicate_capabilities.id
        AND duplicate_capabilities.duplicate_rank > 1
    `);
    await client.query('DROP INDEX IF EXISTS idx_bookings_cancellation_token');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_cancellation_token_hash
      ON bookings(cancellation_token_hash)
      WHERE cancellation_token_hash IS NOT NULL
    `);
    await client.query(`
      ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_raw_cancellation_token_forbidden,
      DROP CONSTRAINT IF EXISTS bookings_cancellation_capability_pair
    `);
    await client.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT bookings_raw_cancellation_token_forbidden
        CHECK (cancellation_token IS NULL),
      ADD CONSTRAINT bookings_cancellation_capability_pair
        CHECK (
          (cancellation_token_hash IS NULL AND cancellation_token_expires_at IS NULL)
          OR (
            cancellation_token_hash ~ '^[a-f0-9]{64}$'
            AND cancellation_token_expires_at IS NOT NULL
          )
        )
    `);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (client !== pool) client.release();
  }
}

module.exports = { runBookingPublicCapabilityMigration };
