/**
 * Google Calendar Integration Service
 * Handles OAuth flow and two-way sync between Itemize bookings and Google Calendar
 */
const { google } = require('googleapis');

// OAuth2 Configuration
const getOAuth2Client = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.NODE_ENV === 'production'
        ? 'https://api.itemize.cloud/api/calendar-integrations/google/callback'
        : 'http://localhost:3001/api/calendar-integrations/google/callback';

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

/**
 * Generate OAuth authorization URL
 */
const getAuthUrl = (state = {}) => {
    const oauth2Client = getOAuth2Client();

    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ];

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent', // Force refresh token generation
        state: JSON.stringify(state),
    });
};

/**
 * Exchange authorization code for tokens
 */
const exchangeCodeForTokens = async (code) => {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
};

/**
 * Get authenticated calendar client
 */
const getCalendarClient = (accessToken, refreshToken) => {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
    return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * Get user info from Google
 */
const getUserInfo = async (accessToken) => {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data;
};

/**
 * List user's calendars
 */
const listCalendars = async (accessToken, refreshToken) => {
    const calendar = getCalendarClient(accessToken, refreshToken);
    const { data } = await calendar.calendarList.list();

    return data.items.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary || false,
        backgroundColor: cal.backgroundColor,
        accessRole: cal.accessRole,
    }));
};

/**
 * Create event in Google Calendar from booking
 */
const createEventFromBooking = async (connection, booking, calendarId = 'primary') => {
    const calendar = getCalendarClient(connection.access_token, connection.refresh_token);

    const event = {
        summary: booking.title || `Booking with ${booking.attendee_name}`,
        description: booking.notes || `Booking via Itemize.cloud`,
        start: {
            dateTime: booking.start_time,
            timeZone: booking.timezone,
        },
        end: {
            dateTime: booking.end_time,
            timeZone: booking.timezone,
        },
        attendees: booking.attendee_email ? [{ email: booking.attendee_email }] : [],
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 30 },
            ],
        },
        extendedProperties: {
            private: {
                itemize_booking_id: String(booking.id),
                itemize_organization_id: String(booking.organization_id),
            },
        },
    };

    const { data } = await calendar.events.insert({
        calendarId,
        resource: event,
        sendUpdates: 'none',
    });

    return {
        eventId: data.id,
        htmlLink: data.htmlLink,
        calendarId,
    };
};

/**
 * Update event in Google Calendar
 */
const updateEvent = async (connection, eventId, booking, calendarId = 'primary') => {
    const calendar = getCalendarClient(connection.access_token, connection.refresh_token);

    const event = {
        summary: booking.title || `Booking with ${booking.attendee_name}`,
        description: booking.notes || `Booking via Itemize.cloud`,
        start: {
            dateTime: booking.start_time,
            timeZone: booking.timezone,
        },
        end: {
            dateTime: booking.end_time,
            timeZone: booking.timezone,
        },
    };

    const { data } = await calendar.events.patch({
        calendarId,
        eventId,
        resource: event,
    });

    return data;
};

/**
 * Delete event from Google Calendar
 */
const deleteEvent = async (connection, eventId, calendarId = 'primary') => {
    const calendar = getCalendarClient(connection.access_token, connection.refresh_token);

    await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: 'none',
    });
};

/**
 * List events from Google Calendar for a time range
 */
const listEvents = async (connection, calendarId, timeMin, timeMax) => {
    const calendar = getCalendarClient(connection.access_token, connection.refresh_token);

    const { data } = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });

    return data.items.map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        timezone: event.start.timeZone,
        attendees: event.attendees || [],
        htmlLink: event.htmlLink,
        status: event.status,
        extendedProperties: event.extendedProperties,
    }));
};

/**
 * Check if connection tokens need refresh
 */
const needsTokenRefresh = (tokenExpiresAt) => {
    if (!tokenExpiresAt) return true;
    const expiresAt = new Date(tokenExpiresAt);
    const now = new Date();
    // Refresh if expires within 5 minutes
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
};

/**
 * Sync bookings to Google Calendar
 */
const syncBookingsToGoogle = async (pool, connection, bookings) => {
    const results = {
        created: 0,
        updated: 0,
        failed: 0,
        errors: [],
    };

    for (const booking of bookings) {
        try {
            // Check if already synced
            const existingSync = await pool.query(
                'SELECT * FROM calendar_sync_events WHERE connection_id = $1 AND booking_id = $2',
                [connection.id, booking.id]
            );

            if (existingSync.rows.length > 0) {
                // Update existing event
                const syncEvent = existingSync.rows[0];
                await updateEvent(connection, syncEvent.external_event_id, booking, syncEvent.external_calendar_id);

                await pool.query(
                    'UPDATE calendar_sync_events SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1',
                    [syncEvent.id]
                );
                results.updated++;
            } else {
                // Create new event
                const calendarId = connection.selected_calendars?.[0] || 'primary';
                const { eventId } = await createEventFromBooking(connection, booking, calendarId);

                await pool.query(`
                    INSERT INTO calendar_sync_events 
                    (connection_id, booking_id, external_event_id, external_calendar_id, sync_direction)
                    VALUES ($1, $2, $3, $4, 'push')
                `, [connection.id, booking.id, eventId, calendarId]);

                results.created++;
            }
        } catch (error) {
            results.failed++;
            results.errors.push({
                bookingId: booking.id,
                error: error.message,
            });
        }
    }

    // Update last sync timestamp
    await pool.query(
        'UPDATE calendar_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
        [connection.id]
    );

    return results;
};

module.exports = {
    getOAuth2Client,
    getAuthUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getCalendarClient,
    getUserInfo,
    listCalendars,
    createEventFromBooking,
    updateEvent,
    deleteEvent,
    listEvents,
    needsTokenRefresh,
    syncBookingsToGoogle,
};
