const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const CALENDAR_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'description',
    'slug',
    'public_id',
    'timezone',
    'duration_minutes',
    'buffer_before_minutes',
    'buffer_after_minutes',
    'min_notice_hours',
    'max_future_days',
    'assigned_to',
    'assignment_mode',
    'confirmation_email',
    'reminder_email',
    'reminder_hours',
    'color',
    'is_active',
    'created_by',
    'created_at',
    'updated_at'
];

const AVAILABILITY_WINDOW_COLUMNS = [
    'id',
    'calendar_id',
    'day_of_week',
    'start_time',
    'end_time',
    'is_active',
    'created_at'
];

const DATE_OVERRIDE_COLUMNS = [
    'id',
    'calendar_id',
    'override_date',
    'is_available',
    'start_time',
    'end_time',
    'reason',
    'created_at'
];

const BOOKING_COLUMNS = [
    'id',
    'organization_id',
    'calendar_id',
    'contact_id',
    'title',
    'start_time',
    'end_time',
    'timezone',
    'attendee_name',
    'attendee_email',
    'attendee_phone',
    'assigned_to',
    'status',
    'cancelled_at',
    'cancellation_reason',
    'notes',
    'internal_notes',
    'reminder_sent_at',
    'custom_fields',
    'source',
    'created_at',
    'updated_at'
];

const CALENDAR_CONNECTION_COLUMNS = [
    'id',
    'user_id',
    'organization_id',
    'provider',
    'provider_account_id',
    'provider_email',
    'token_expires_at',
    'token_generation',
    'sync_enabled',
    'sync_direction',
    'last_sync_at',
    'sync_cursor',
    'selected_calendars',
    'is_active',
    'error_message',
    'error_count',
    'created_at',
    'updated_at'
];

const CALENDAR_SYNC_EVENT_COLUMNS = [
    'id',
    'connection_id',
    'booking_id',
    'external_event_id',
    'external_calendar_id',
    'sync_direction',
    'last_synced_at',
    'external_updated_at',
    'event_hash',
    'created_at',
    'updated_at'
];

const calendarColumns = (alias) => alias ? qualify(CALENDAR_COLUMNS, alias) : CALENDAR_COLUMNS.join(', ');
const availabilityWindowColumns = (alias) => alias ? qualify(AVAILABILITY_WINDOW_COLUMNS, alias) : AVAILABILITY_WINDOW_COLUMNS.join(', ');
const dateOverrideColumns = (alias) => alias ? qualify(DATE_OVERRIDE_COLUMNS, alias) : DATE_OVERRIDE_COLUMNS.join(', ');
const bookingColumns = (alias) => alias ? qualify(BOOKING_COLUMNS, alias) : BOOKING_COLUMNS.join(', ');
const calendarConnectionColumns = (alias) => alias ? qualify(CALENDAR_CONNECTION_COLUMNS, alias) : CALENDAR_CONNECTION_COLUMNS.join(', ');
const calendarSyncEventColumns = (alias) => alias ? qualify(CALENDAR_SYNC_EVENT_COLUMNS, alias) : CALENDAR_SYNC_EVENT_COLUMNS.join(', ');

module.exports = {
    calendarColumns,
    availabilityWindowColumns,
    dateOverrideColumns,
    bookingColumns,
    calendarConnectionColumns,
    calendarSyncEventColumns
};
