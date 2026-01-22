/**
 * Calendar Database Migrations
 * Schema for calendars, availability windows, bookings, and date overrides
 */

/**
 * Create calendars table for appointment booking
 */
const runCalendarsMigration = async (pool) => {
    console.log('Running calendars table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS calendars (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        slug VARCHAR(255) NOT NULL,
        timezone VARCHAR(100) DEFAULT 'America/New_York',
        
        -- Booking settings
        duration_minutes INTEGER DEFAULT 30,
        buffer_before_minutes INTEGER DEFAULT 0,
        buffer_after_minutes INTEGER DEFAULT 0,
        min_notice_hours INTEGER DEFAULT 24,
        max_future_days INTEGER DEFAULT 60,
        
        -- Assignment
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assignment_mode VARCHAR(20) DEFAULT 'specific' CHECK (assignment_mode IN ('specific', 'round_robin')),
        
        -- Notifications
        confirmation_email BOOLEAN DEFAULT TRUE,
        reminder_email BOOLEAN DEFAULT TRUE,
        reminder_hours INTEGER DEFAULT 24,
        
        -- Appearance
        color VARCHAR(7) DEFAULT '#3B82F6',
        
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(organization_id, slug)
      );
    `);
        console.log('✅ Calendars table created');

        // Create indexes
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendars_org_id ON calendars(organization_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendars_slug ON calendars(slug);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendars_assigned_to ON calendars(assigned_to);
    `);
        console.log('✅ Calendars indexes created');

        console.log('✅ Calendars migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Calendars migration failed:', error.message);
        return false;
    }
};

/**
 * Create availability_windows table for recurring availability
 */
const runAvailabilityWindowsMigration = async (pool) => {
    console.log('Running availability windows table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS availability_windows (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Availability windows table created');

        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_calendar_id ON availability_windows(calendar_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_day ON availability_windows(day_of_week);
    `);
        console.log('✅ Availability windows indexes created');

        console.log('✅ Availability windows migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Availability windows migration failed:', error.message);
        return false;
    }
};

/**
 * Create bookings table for appointments
 */
const runBookingsMigration = async (pool) => {
    console.log('Running bookings table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        
        -- Booking details
        title VARCHAR(255),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        timezone VARCHAR(100) NOT NULL,
        
        -- Attendee info (if no contact linked)
        attendee_name VARCHAR(255),
        attendee_email VARCHAR(255),
        attendee_phone VARCHAR(50),
        
        -- Assignment
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Status
        status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
        cancelled_at TIMESTAMP WITH TIME ZONE,
        cancellation_reason TEXT,
        cancellation_token VARCHAR(64),
        
        -- Notes
        notes TEXT,
        internal_notes TEXT,
        
        -- Reminders
        reminder_sent_at TIMESTAMP WITH TIME ZONE,
        
        -- Metadata
        custom_fields JSONB DEFAULT '{}'::jsonb,
        source VARCHAR(50) DEFAULT 'booking_page' CHECK (source IN ('booking_page', 'manual', 'api', 'import')),
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Bookings table created');

        // Create indexes
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_org_id ON bookings(organization_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_calendar_id ON bookings(calendar_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_contact_id ON bookings(contact_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_assigned_to ON bookings(assigned_to);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_token ON bookings(cancellation_token);
    `);
        console.log('✅ Bookings indexes created');

        console.log('✅ Bookings migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Bookings migration failed:', error.message);
        return false;
    }
};

/**
 * Create calendar_date_overrides table for blocking/customizing specific dates
 */
const runCalendarDateOverridesMigration = async (pool) => {
    console.log('Running calendar date overrides table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_date_overrides (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        override_date DATE NOT NULL,
        is_available BOOLEAN DEFAULT FALSE,
        start_time TIME,
        end_time TIME,
        reason VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(calendar_id, override_date)
      );
    `);
        console.log('✅ Calendar date overrides table created');

        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_date_overrides_calendar_id ON calendar_date_overrides(calendar_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_date_overrides_date ON calendar_date_overrides(override_date);
    `);
        console.log('✅ Calendar date overrides indexes created');

        console.log('✅ Calendar date overrides migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Calendar date overrides migration failed:', error.message);
        return false;
    }
};

/**
 * Run all calendar migrations in order
 */
const runAllCalendarMigrations = async (pool) => {
    console.log('=== Starting Calendar Migrations ===');

    const migrations = [
        { name: 'Calendars', fn: runCalendarsMigration },
        { name: 'Availability Windows', fn: runAvailabilityWindowsMigration },
        { name: 'Bookings', fn: runBookingsMigration },
        { name: 'Calendar Date Overrides', fn: runCalendarDateOverridesMigration },
    ];

    for (const migration of migrations) {
        console.log(`\n--- Running ${migration.name} Migration ---`);
        const success = await migration.fn(pool);
        if (!success) {
            console.error(`⚠️ ${migration.name} migration failed, continuing with next...`);
        }
    }

    console.log('\n=== Calendar Migrations Complete ===');
    return true;
};

module.exports = {
    runCalendarsMigration,
    runAvailabilityWindowsMigration,
    runBookingsMigration,
    runCalendarDateOverridesMigration,
    runAllCalendarMigrations,
};
