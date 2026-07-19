/**
 * Google Calendar Integration Service
 * Handles OAuth flow and two-way sync between Itemize bookings and Google Calendar
 * Extended with retry logic and better error handling (Phase 6)
 */
const crypto = require('crypto');
const { google } = require('googleapis');
const { logger } = require('../utils/logger');
const { calendarSyncEventColumns } = require('../routes/calendar-columns');

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const deterministicGoogleEventId = (connectionId, bookingId) => crypto
    .createHash('sha256')
    .update(`itemize:${connectionId}:${bookingId}`)
    .digest('hex');

const safeProviderError = error => String(error?.message || error || 'Provider operation failed')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bya29\.[A-Za-z0-9._-]+\b/g, '[redacted-token]')
    .slice(0, 300);

const zonedDateStart = (dateValue, timeZone) => {
    const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateValue;
    const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    let instant = target;
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = Object.fromEntries(
            formatter.formatToParts(new Date(instant))
                .filter(part => part.type !== 'literal')
                .map(part => [part.type, Number(part.value)])
        );
        const represented = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        );
        instant += target - represented;
    }
    return new Date(instant).toISOString();
};

/**
 * Execute an operation with retry logic
 */
const withRetry = async (operation, context = {}) => {
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Don't retry on auth errors
            if (error.code === 401 || error.code === 403) {
                throw error;
            }
            
            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY * Math.pow(2, attempt - 1);
                logger.warn('GoogleCalendar: Retry attempt', { 
                    attempt, 
                    maxRetries: MAX_RETRIES,
                    context, 
                    error: error.message 
                });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    logger.error('GoogleCalendar: All retries failed', { context, error: lastError.message });
    throw lastError;
};

// OAuth2 Configuration
const getCalendarOAuthRedirectUri = () => {
    const configured = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
    if (!configured) {
        return process.env.NODE_ENV === 'production'
            ? 'https://api.itemize.cloud/api/calendar-integrations/google/callback'
            : 'http://localhost:3001/api/calendar-integrations/google/callback';
    }

    let parsed;
    try {
        parsed = new URL(configured);
    } catch {
        throw new Error('GOOGLE_CALENDAR_REDIRECT_URI must be an absolute HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.hash
        || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
        throw new Error(
            'GOOGLE_CALENDAR_REDIRECT_URI must be a credential-free HTTPS URL in production'
        );
    }
    return configured;
};

const getOAuth2Client = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getCalendarOAuthRedirectUri();

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
        state: typeof state === 'string' ? state : JSON.stringify(state),
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
 * Refresh access token using refresh token with retry logic
 */
const refreshAccessToken = async (refreshToken) => {
    return withRetry(async () => {
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        logger.info('GoogleCalendar: Access token refreshed successfully');
        return credentials;
    }, { operation: 'refreshAccessToken' });
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
        id: deterministicGoogleEventId(connection.id, booking.id),
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
    const events = [];
    let pageToken;
    for (let page = 0; page < 10; page += 1) {
        const { data } = await calendar.events.list({
            calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            pageToken,
        });
        for (const event of data.items || []) {
            const timeZone = event.start?.timeZone || data.timeZone || 'UTC';
            events.push({
                id: event.id,
                summary: event.summary,
                description: event.description,
                start: event.start?.dateTime || zonedDateStart(event.start?.date, timeZone),
                end: event.end?.dateTime || zonedDateStart(event.end?.date, timeZone),
                timezone: timeZone,
                attendees: event.attendees || [],
                htmlLink: event.htmlLink,
                status: event.status,
                extendedProperties: event.extendedProperties,
            });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) return events;
    }
    const error = new Error('Calendar event page limit exceeded');
    error.code = 'CALENDAR_EVENT_PAGE_LIMIT';
    throw error;
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
        deleted: 0,
        failed: 0,
        errors: [],
    };

    for (const booking of bookings) {
        try {
            // Check if already synced
            const existingSync = await pool.query(
                `SELECT ${calendarSyncEventColumns()} FROM calendar_sync_events WHERE connection_id = $1 AND booking_id = $2`,
                [connection.id, booking.id]
            );

            if (existingSync.rows.length > 0) {
                const syncEvent = existingSync.rows[0];
                if (booking.status === 'cancelled') {
                    try {
                        await deleteEvent(
                            connection,
                            syncEvent.external_event_id,
                            syncEvent.external_calendar_id
                        );
                    } catch (error) {
                        const status = error?.response?.status || error?.code;
                        if (Number(status) !== 404) throw error;
                    }
                    await pool.query(
                        'DELETE FROM calendar_sync_events WHERE id = $1 AND connection_id = $2',
                        [syncEvent.id, connection.id]
                    );
                    results.deleted++;
                    continue;
                }

                await updateEvent(connection, syncEvent.external_event_id, booking, syncEvent.external_calendar_id);
                await pool.query(
                    'UPDATE calendar_sync_events SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1',
                    [syncEvent.id]
                );
                results.updated++;
            } else {
                if (booking.status === 'cancelled') continue;
                const calendarId = connection.selected_calendars?.[0] || 'primary';
                const eventId = deterministicGoogleEventId(connection.id, booking.id);
                try {
                    await createEventFromBooking(connection, booking, calendarId);
                } catch (error) {
                    const status = error?.response?.status || error?.code;
                    if (Number(status) !== 409) throw error;
                    await updateEvent(connection, eventId, booking, calendarId);
                }

                await pool.query(`
                    INSERT INTO calendar_sync_events 
                    (connection_id, booking_id, external_event_id, external_calendar_id, sync_direction)
                    VALUES ($1, $2, $3, $4, 'push')
                    ON CONFLICT (connection_id, booking_id)
                    WHERE booking_id IS NOT NULL
                    DO UPDATE SET
                        external_event_id = EXCLUDED.external_event_id,
                        external_calendar_id = EXCLUDED.external_calendar_id,
                        sync_direction = 'push',
                        last_synced_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                `, [connection.id, booking.id, eventId, calendarId]);

                results.created++;
            }
        } catch (error) {
            results.failed++;
            results.errors.push({
                bookingId: booking.id,
                error: safeProviderError(error),
            });
        }
    }

    return results;
};

module.exports = {
    getCalendarOAuthRedirectUri,
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
    deterministicGoogleEventId,
    syncBookingsToGoogle,
};
