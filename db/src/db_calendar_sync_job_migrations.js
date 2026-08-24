async function runCalendarSyncJobMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_sync_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      connection_id INTEGER NOT NULL
        REFERENCES calendar_connections(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128),
      idempotency_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('push', 'pull', 'both')),
      selected_calendars JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'processing', 'retry', 'succeeded', 'dead_letter'
        )),
      attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      result JSONB,
      last_error TEXT,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT calendar_sync_job_selected_calendars_array
        CHECK (jsonb_typeof(selected_calendars) = 'array'),
      CONSTRAINT calendar_sync_job_idempotency_keys_array
        CHECK (jsonb_typeof(idempotency_keys) = 'array'),
      CONSTRAINT calendar_sync_job_idempotency
        UNIQUE (connection_id, idempotency_key)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_sync_jobs_active_connection
      ON calendar_sync_jobs(connection_id)
      WHERE status IN ('queued', 'processing', 'retry');

    CREATE INDEX IF NOT EXISTS idx_calendar_sync_jobs_claim
      ON calendar_sync_jobs(status, next_attempt_at, created_at);

    CREATE INDEX IF NOT EXISTS idx_calendar_sync_jobs_organization
      ON calendar_sync_jobs(organization_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE calendar_sync_jobs
      ADD COLUMN IF NOT EXISTS idempotency_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
    UPDATE calendar_sync_jobs
    SET idempotency_keys = jsonb_build_array(idempotency_key)
    WHERE idempotency_key IS NOT NULL
      AND NOT (idempotency_keys ? idempotency_key::text);
    DO $constraint$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'calendar_sync_job_idempotency_keys_array'
      ) THEN
        ALTER TABLE calendar_sync_jobs
          ADD CONSTRAINT calendar_sync_job_idempotency_keys_array
          CHECK (jsonb_typeof(idempotency_keys) = 'array');
      END IF;
    END
    $constraint$;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_calendar_sync_job_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM calendar_connections connection
        WHERE connection.id = NEW.connection_id
          AND connection.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Calendar sync job connection must share its organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'calendar_sync_job_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS calendar_sync_job_tenant ON calendar_sync_jobs;
    CREATE TRIGGER calendar_sync_job_tenant
      BEFORE INSERT OR UPDATE OF organization_id, connection_id
      ON calendar_sync_jobs
      FOR EACH ROW
      EXECUTE FUNCTION enforce_calendar_sync_job_tenant();
  `);

  await pool.query(`
    WITH duplicate_sync_events AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY connection_id, booking_id
               ORDER BY last_synced_at DESC NULLS LAST, id DESC
             ) AS duplicate_rank
      FROM calendar_sync_events
      WHERE booking_id IS NOT NULL
    )
    DELETE FROM calendar_sync_events event
    USING duplicate_sync_events duplicate
    WHERE event.id = duplicate.id
      AND duplicate.duplicate_rank > 1
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_sync_events_booking
      ON calendar_sync_events(connection_id, booking_id)
      WHERE booking_id IS NOT NULL
  `);

  return true;
}

module.exports = { runCalendarSyncJobMigration };
