/**
 * Bookings Routes
 * Handles booking management and public booking endpoints
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { withDbClient, withTransaction } = require('../utils/db');
const { sendError } = require('../utils/response');
const { bookingColumns } = require('./calendar-columns');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');
const { normalizeContactEmail } = require('../utils/contactEmail');

/**
 * Create bookings routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Object} publicRateLimit - Rate limiter for public endpoints
 */
module.exports = (pool, publicRateLimit) => {
    /**
     * Generate cancellation token
     */
    const generateCancellationToken = () => crypto.randomBytes(32).toString('hex');
    const hashCancellationToken = (token) => crypto
        .createHash('sha256')
        .update(token, 'utf8')
        .digest('hex');

    const resolvePublicCalendarId = async (client, identifier) => {
        const publicIdResult = await client.query(
            `SELECT id
             FROM calendars
             WHERE public_id = $1 AND is_active = TRUE`,
            [identifier]
        );
        if (publicIdResult.rows.length === 1) return publicIdResult.rows[0].id;

        const legacySlugResult = await client.query(
            `SELECT id
             FROM calendars
             WHERE slug = $1 AND is_active = TRUE
             ORDER BY id
             LIMIT 2`,
            [identifier]
        );
        return legacySlugResult.rows.length === 1
            ? legacySlugResult.rows[0].id
            : null;
    };

    const validateTimeRange = (startTime, endTime) => {
        const start = new Date(startTime);
        const end = new Date(endTime);
        return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
    };

    const validateDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
            ? parsed
            : null;
    };

    const slotPolicyReason = async (
        client,
        calendarId,
        startTime,
        endTime,
        excludeBookingId = null,
        requireCalendarDuration = false
    ) => {
        const result = await client.query(
            `SELECT booking_slot_policy_reason(
               $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
             ) AS reason`,
            [
                calendarId,
                startTime,
                endTime,
                excludeBookingId,
                requireCalendarDuration,
            ]
        );
        return result.rows[0]?.reason || null;
    };

    const lockCalendarBookings = (client, calendarId) => client.query(
        "SELECT pg_advisory_xact_lock(hashtext('calendar_booking'), $1::integer)",
        [calendarId]
    );

    // ======================
    // Public Booking Routes
    // ======================

    /**
     * GET /api/public/book/:slug
     * Get public calendar info for booking page
     */
    router.get('/public/book/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug: identifier } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const calendarId = await resolvePublicCalendarId(client, identifier);
                if (calendarId === null) return { calendar: null, availability: [] };
                const result = await client.query(`
        SELECT 
          c.id, c.name, c.description, c.slug, c.public_id, c.timezone,
          c.duration_minutes, c.min_notice_hours, c.max_future_days,
          c.color, c.is_active,
          o.name as organization_name
        FROM calendars c
        JOIN organizations o ON c.organization_id = o.id
        WHERE c.id = $1 AND c.is_active = TRUE
      `, [calendarId]);

                if (result.rows.length !== 1) {
                    return { calendar: null, availability: [] };
                }

                // Get availability windows
                const calendar = result.rows[0];
                const availabilityResult = await client.query(`
        SELECT day_of_week, start_time, end_time
        FROM availability_windows
        WHERE calendar_id = $1 AND is_active = TRUE
        ORDER BY day_of_week, start_time
      `, [calendar.id]);

                return { calendar, availability: availabilityResult.rows };
            });

            if (!data.calendar) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            data.calendar.availability = data.availability;
            res.json(data.calendar);
        } catch (error) {
            console.error('Error fetching public calendar:', error);
            return sendError(res, 'Failed to load booking page');
        }
    });

    /**
     * GET /api/public/book/:slug/slots
     * Get available time slots for a date range
     */
    router.get('/public/book/:slug/slots', publicRateLimit, async (req, res) => {
        try {
            const { slug: identifier } = req.params;
            const { start_date, end_date } = req.query;

            const parsedStart = validateDate(start_date);
            const resolvedEnd = end_date || start_date;
            const parsedEnd = validateDate(resolvedEnd);
            if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
                return res.status(400).json({
                    error: 'start_date and end_date must form a valid ISO date range',
                });
            }
            const dayRange = Math.round(
                (parsedEnd.getTime() - parsedStart.getTime()) / 86400000
            );
            if (dayRange > 30) {
                return res.status(400).json({
                    error: 'Slot queries are limited to 31 calendar days',
                });
            }

            const data = await withDbClient(pool, async (client) => {
                const calendarId = await resolvePublicCalendarId(client, identifier);
                if (calendarId === null) return { calendar: null, slots: [] };
                const calendarResult = await client.query(`
        SELECT id, duration_minutes, min_notice_hours, max_future_days, timezone
        FROM calendars
        WHERE id = $1 AND is_active = TRUE
      `, [calendarId]);

                if (calendarResult.rows.length !== 1) {
                    return { calendar: null, slots: [] };
                }

                const calendar = calendarResult.rows[0];
                const slotsResult = await client.query(`
        SELECT start_time, end_time
        FROM booking_available_slots($1, $2::date, $3::date, CURRENT_TIMESTAMP)
      `, [calendar.id, start_date, resolvedEnd]);
                return {
                    calendar,
                    slots: slotsResult.rows,
                };
            });

            if (!data.calendar) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            res.json({
                calendar: {
                    id: data.calendar.id,
                    duration_minutes: data.calendar.duration_minutes,
                    min_notice_hours: data.calendar.min_notice_hours,
                    max_future_days: data.calendar.max_future_days,
                    timezone: data.calendar.timezone
                },
                slots: data.slots
            });
        } catch (error) {
            console.error('Error fetching available slots:', error);
            return sendError(res, 'Failed to fetch available slots');
        }
    });

    /**
     * POST /api/public/book/:slug
     * Submit a public booking
     */
    router.post('/public/book/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug: identifier } = req.params;
            const {
                start_time,
                end_time,
                timezone,
                attendee_name,
                attendee_email,
                attendee_phone,
                notes,
                custom_fields
            } = req.body;

            // Validation
            if (!start_time || !attendee_name || !attendee_email) {
                return res.status(400).json({
                    error: 'start_time, attendee_name, and attendee_email are required'
                });
            }
            if (Number.isNaN(new Date(start_time).getTime())) {
                return res.status(400).json({ error: 'start_time must be a valid timestamp' });
            }

            const data = await withTransaction(pool, async (client) => {
                const resolvedCalendarId = await resolvePublicCalendarId(client, identifier);
                if (resolvedCalendarId === null) {
                    return { error: 'Calendar not found', status: 404, booking: null, calendar: null, contactId: null };
                }
                const calendarResult = await client.query(`
        SELECT id, organization_id, public_id, duration_minutes, assigned_to, min_notice_hours, timezone
        FROM calendars
        WHERE id = $1 AND is_active = TRUE
      `, [resolvedCalendarId]);

                if (calendarResult.rows.length !== 1) {
                    return { error: 'Calendar not found', status: 404, booking: null, calendar: null, contactId: null };
                }

                let calendar = calendarResult.rows[0];

                // Calculate end_time if not provided
                const bookingEndTime = end_time || new Date(
                    new Date(start_time).getTime() + calendar.duration_minutes * 60000
                ).toISOString();

                if (!validateTimeRange(start_time, bookingEndTime)) {
                    return { error: 'start_time and end_time must form a valid time range', status: 400, booking: null, calendar: null, contactId: null };
                }

                await lockCalendarBookings(client, calendar.id);

                const currentCalendarId = await resolvePublicCalendarId(client, identifier);
                if (currentCalendarId !== calendar.id) {
                    return { error: 'Calendar not found', status: 404, booking: null, calendar: null, contactId: null };
                }
                const currentCalendar = await client.query(`
        SELECT id, organization_id, public_id, duration_minutes, assigned_to, min_notice_hours, timezone
        FROM calendars
        WHERE id = $1 AND is_active = TRUE
        FOR UPDATE
      `, [calendar.id]);
                if (currentCalendar.rows.length === 0) {
                    return { error: 'Calendar not found', status: 404, booking: null, calendar: null, contactId: null };
                }
                calendar = currentCalendar.rows[0];

                const policyReason = await slotPolicyReason(
                    client,
                    calendar.id,
                    start_time,
                    bookingEndTime,
                    null,
                    true
                );
                if (policyReason) {
                    return {
                        error: 'This time slot is no longer available',
                        reason: policyReason,
                        status: 409,
                        booking: null,
                        calendar: null,
                        contactId: null,
                    };
                }

                const cancellationToken = generateCancellationToken();
                const cancellationTokenHash = hashCancellationToken(cancellationToken);

                // Try to find or create contact
                let contactId = null;
                try {
                    const normalizedAttendeeEmail = normalizeContactEmail(attendee_email);
                    await client.query(
                        "SELECT pg_advisory_xact_lock(hashtext('contact-email'), hashtext($1::text || ':' || $2))",
                        [calendar.organization_id, normalizedAttendeeEmail]
                    );
                    const existingContact = await client.query(
                        `SELECT id
                         FROM contacts
                         WHERE organization_id = $1 AND email = $2
                         ORDER BY id
                         LIMIT 1`,
                        [calendar.organization_id, normalizedAttendeeEmail]
                    );

                    if (existingContact.rows.length > 0) {
                        contactId = existingContact.rows[0].id;
                    } else {
                        // Create new contact
                        const nameParts = attendee_name.trim().split(' ');
                        const firstName = nameParts[0] || '';
                        const lastName = nameParts.slice(1).join(' ') || '';

                        const newContact = await client.query(`
            INSERT INTO contacts (organization_id, first_name, last_name, email, phone, source)
            VALUES ($1, $2, $3, $4, $5, 'form')
            RETURNING id
          `, [calendar.organization_id, firstName, lastName, normalizedAttendeeEmail, attendee_phone]);

                        contactId = newContact.rows[0].id;
                    }
                } catch (contactError) {
                    console.warn('Could not create/find contact:', contactError.message);
                }

                // Create booking
                const result = await client.query(`
        INSERT INTO bookings (
          organization_id, calendar_id, contact_id,
          start_time, end_time, timezone,
          attendee_name, attendee_email, attendee_phone,
          assigned_to, notes, custom_fields,
          cancellation_token_hash, cancellation_token_expires_at, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $5::timestamptz + INTERVAL '1 day', 'booking_page'
        )
        RETURNING id, start_time, end_time, timezone, attendee_name, attendee_email
      `, [
                    calendar.organization_id,
                    calendar.id,
                    contactId,
                    start_time,
                    bookingEndTime,
                    timezone || calendar.timezone || 'America/New_York',
                    attendee_name,
                    attendee_email,
                    attendee_phone || null,
                    calendar.assigned_to,
                    notes || null,
                    JSON.stringify(custom_fields || {}),
                    cancellationTokenHash
                ]);

                const booking = {
                    ...result.rows[0],
                    cancellation_token: cancellationToken,
                };
                await enqueueWorkflowTrigger(client, {
                    contactId,
                    entityId: booking.id,
                    entityType: 'booking',
                    eventKey: workflowTriggerEventKey('domain', `booking_created:${booking.id}`),
                    organizationId: calendar.organization_id,
                    payload: {
                        booking_id: booking.id,
                        calendar_id: calendar.id,
                    },
                    triggerType: WORKFLOW_TRIGGERS.BOOKING_CREATED,
                });

                return { error: null, status: 201, booking, calendar, contactId };
            });

            if (data.error) {
                return res.status(data.status).json({
                    error: data.error,
                    ...(data.reason ? { reason: data.reason } : {}),
                });
            }

            res.status(201).json({
                success: true,
                booking: data.booking,
                message: 'Booking confirmed! Check your email for confirmation details.'
            });
        } catch (error) {
            console.error('Error creating public booking:', error);
            return sendError(res, 'Failed to create booking');
        }
    });

    /**
     * POST /api/public/book/:slug/cancel/:token
     * Cancel a booking using cancellation token
     */
    router.post('/public/book/:slug/cancel/:token', publicRateLimit, async (req, res) => {
        try {
            const { slug: identifier, token } = req.params;
            const { reason } = req.body;

            if (!/^[a-f0-9]{64}$/.test(token)) {
                return res.status(404).json({ error: 'Booking not found or already cancelled' });
            }

            const result = await withTransaction(pool, async (client) => {
                const calendarId = await resolvePublicCalendarId(client, identifier);
                if (calendarId === null) return { rows: [] };
                const tokenHash = hashCancellationToken(token);
                const updateResult = await client.query(`
          UPDATE bookings SET
            status = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            cancellation_reason = $1,
            cancellation_token_hash = NULL,
            cancellation_token_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE bookings.calendar_id = $2
            AND bookings.cancellation_token_hash = $3
            AND bookings.cancellation_token_expires_at > CURRENT_TIMESTAMP
            AND bookings.status = 'confirmed'
          RETURNING ${bookingColumns().split(', ').map(column => `bookings.${column}`).join(', ')}
        `, [reason || 'Cancelled by attendee', calendarId, tokenHash]);
                if (updateResult.rows.length > 0) {
                    const booking = updateResult.rows[0];
                    await enqueueWorkflowTrigger(client, {
                        contactId: booking.contact_id,
                        entityId: booking.id,
                        entityType: 'booking',
                        eventKey: workflowTriggerEventKey('domain', `booking_cancelled:${booking.id}`),
                        organizationId: booking.organization_id,
                        payload: {
                            booking_id: booking.id,
                            reason: reason || 'Cancelled by attendee',
                        },
                        triggerType: WORKFLOW_TRIGGERS.BOOKING_CANCELLED,
                    });
                }
                return updateResult;
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Booking not found or already cancelled' });
            }

            res.json({
                success: true,
                message: 'Your booking has been cancelled.'
            });
        } catch (error) {
            console.error('Error cancelling booking:', error);
            return sendError(res, 'Failed to cancel booking');
        }
    });

    return router;
};
