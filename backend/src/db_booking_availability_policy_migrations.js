const runBookingAvailabilityPolicyMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_external_busy_intervals (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      connection_id INTEGER NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
      external_calendar_id VARCHAR(255) NOT NULL,
      external_event_id VARCHAR(255) NOT NULL,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT calendar_external_busy_interval_range
        CHECK (end_time > start_time),
      CONSTRAINT calendar_external_busy_interval_identity
        UNIQUE (calendar_id, connection_id, external_calendar_id, external_event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_external_busy_interval_organization
      ON calendar_external_busy_intervals(organization_id);

    CREATE INDEX IF NOT EXISTS idx_calendar_external_busy_interval_range
      ON calendar_external_busy_intervals(calendar_id, start_time, end_time);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_calendar_external_busy_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM calendars calendar
        JOIN calendar_connections connection
          ON connection.id = NEW.connection_id
         AND connection.organization_id = NEW.organization_id
        WHERE calendar.id = NEW.calendar_id
          AND calendar.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'External busy interval references must share one organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'calendar_external_busy_interval_tenant';
      END IF;

      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS calendar_external_busy_interval_tenant
      ON calendar_external_busy_intervals;
    CREATE TRIGGER calendar_external_busy_interval_tenant
      BEFORE INSERT OR UPDATE OF organization_id, calendar_id, connection_id
      ON calendar_external_busy_intervals
      FOR EACH ROW
      EXECUTE FUNCTION enforce_calendar_external_busy_tenant();
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION booking_slot_policy_reason(
      p_calendar_id INTEGER,
      p_start_time TIMESTAMP WITH TIME ZONE,
      p_end_time TIMESTAMP WITH TIME ZONE,
      p_exclude_booking_id INTEGER DEFAULT NULL,
      p_require_calendar_duration BOOLEAN DEFAULT FALSE,
      p_now TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    ) RETURNS TEXT
    LANGUAGE plpgsql
    AS $policy$
    DECLARE
      calendar_row calendars%ROWTYPE;
      local_start TIMESTAMP WITHOUT TIME ZONE;
      local_end TIMESTAMP WITHOUT TIME ZONE;
      local_today DATE;
      date_override calendar_date_overrides%ROWTYPE;
      has_window BOOLEAN;
      buffer_before INTERVAL;
      buffer_after INTERVAL;
    BEGIN
      IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
        RETURN 'INVALID_TIME_RANGE';
      END IF;

      SELECT *
      INTO calendar_row
      FROM calendars
      WHERE id = p_calendar_id;

      IF NOT FOUND OR calendar_row.is_active IS NOT TRUE THEN
        RETURN 'CALENDAR_UNAVAILABLE';
      END IF;

      local_start := p_start_time AT TIME ZONE calendar_row.timezone;
      local_end := p_end_time AT TIME ZONE calendar_row.timezone;
      local_today := (p_now AT TIME ZONE calendar_row.timezone)::DATE;

      IF local_start::DATE <> local_end::DATE THEN
        RETURN 'OUTSIDE_AVAILABILITY';
      END IF;

      IF local_end - local_start <> p_end_time - p_start_time THEN
        RETURN 'DST_TRANSITION';
      END IF;

      IF p_require_calendar_duration
         AND p_end_time - p_start_time
             <> make_interval(mins => calendar_row.duration_minutes) THEN
        RETURN 'INVALID_DURATION';
      END IF;

      IF p_start_time
         < p_now + make_interval(hours => calendar_row.min_notice_hours) THEN
        RETURN 'MIN_NOTICE';
      END IF;

      IF local_start::DATE
         > local_today + calendar_row.max_future_days THEN
        RETURN 'MAX_FUTURE';
      END IF;

      SELECT *
      INTO date_override
      FROM calendar_date_overrides
      WHERE calendar_id = p_calendar_id
        AND override_date = local_start::DATE;

      IF FOUND THEN
        IF date_override.is_available IS NOT TRUE
           OR date_override.start_time IS NULL
           OR date_override.end_time IS NULL
           OR local_start::TIME < date_override.start_time
           OR local_end::TIME > date_override.end_time THEN
          RETURN 'OUTSIDE_AVAILABILITY';
        END IF;
      ELSE
        SELECT EXISTS (
          SELECT 1
          FROM availability_windows
          WHERE calendar_id = p_calendar_id
            AND is_active IS TRUE
            AND day_of_week = EXTRACT(DOW FROM local_start)::INTEGER
            AND local_start::TIME >= start_time
            AND local_end::TIME <= end_time
        )
        INTO has_window;

        IF has_window IS NOT TRUE THEN
          RETURN 'OUTSIDE_AVAILABILITY';
        END IF;
      END IF;

      buffer_before := make_interval(
        mins => calendar_row.buffer_before_minutes
      );
      buffer_after := make_interval(
        mins => calendar_row.buffer_after_minutes
      );

      IF EXISTS (
        SELECT 1
        FROM bookings
        WHERE calendar_id = p_calendar_id
          AND status IN ('pending', 'confirmed')
          AND (p_exclude_booking_id IS NULL OR id <> p_exclude_booking_id)
          AND start_time - buffer_before < p_end_time + buffer_after
          AND end_time + buffer_after > p_start_time - buffer_before
      ) THEN
        RETURN 'BOOKING_CONFLICT';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM calendar_external_busy_intervals
        WHERE calendar_id = p_calendar_id
          AND start_time < p_end_time + buffer_after
          AND end_time > p_start_time - buffer_before
      ) THEN
        RETURN 'EXTERNAL_BUSY';
      END IF;

      RETURN NULL;
    END
    $policy$;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION booking_available_slots(
      p_calendar_id INTEGER,
      p_start_date DATE,
      p_end_date DATE,
      p_now TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    ) RETURNS TABLE (
      start_time TIMESTAMP WITH TIME ZONE,
      end_time TIMESTAMP WITH TIME ZONE
    )
    LANGUAGE sql
    STABLE
    AS $slots$
      WITH selected_calendar AS (
        SELECT id, timezone, duration_minutes
        FROM calendars
        WHERE id = p_calendar_id
          AND is_active IS TRUE
      ),
      selected_dates AS (
        SELECT generated::DATE AS local_date
        FROM generate_series(
          p_start_date::TIMESTAMP,
          p_end_date::TIMESTAMP,
          INTERVAL '1 day'
        ) generated
      ),
      effective_windows AS (
        SELECT
          dates.local_date,
          override.start_time,
          override.end_time
        FROM selected_dates dates
        JOIN calendar_date_overrides override
          ON override.calendar_id = p_calendar_id
         AND override.override_date = dates.local_date
         AND override.is_available IS TRUE
        WHERE override.start_time IS NOT NULL
          AND override.end_time IS NOT NULL

        UNION ALL

        SELECT
          dates.local_date,
          availability.start_time,
          availability.end_time
        FROM selected_dates dates
        JOIN availability_windows availability
          ON availability.calendar_id = p_calendar_id
         AND availability.is_active IS TRUE
         AND availability.day_of_week = EXTRACT(DOW FROM dates.local_date)::INTEGER
        WHERE NOT EXISTS (
          SELECT 1
          FROM calendar_date_overrides override
          WHERE override.calendar_id = p_calendar_id
            AND override.override_date = dates.local_date
        )
      ),
      candidates AS (
        SELECT
          calendar.timezone,
          calendar.duration_minutes,
          generated AS candidate_start
        FROM selected_calendar calendar
        CROSS JOIN effective_windows effective
        CROSS JOIN LATERAL generate_series(
          (effective.local_date + effective.start_time) AT TIME ZONE calendar.timezone,
          (effective.local_date + effective.end_time) AT TIME ZONE calendar.timezone
            - make_interval(mins => calendar.duration_minutes),
          make_interval(mins => calendar.duration_minutes)
        ) generated
      ),
      deterministic_folds AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY candidate_start AT TIME ZONE timezone
            ORDER BY candidate_start DESC
          ) AS fold_rank
        FROM candidates
      )
      SELECT
        candidate_start,
        candidate_start + make_interval(mins => duration_minutes)
      FROM deterministic_folds
      WHERE fold_rank = 1
        AND booking_slot_policy_reason(
          p_calendar_id,
          candidate_start,
          candidate_start + make_interval(mins => duration_minutes),
          NULL,
          TRUE,
          p_now
        ) IS NULL
      ORDER BY candidate_start
    $slots$;
  `);

  return true;
};

module.exports = {
  runBookingAvailabilityPolicyMigration,
};
