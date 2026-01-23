/**
 * Bookings Routes
 * Handles booking management and public booking endpoints
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');

// Import automation engine for triggers
let automationEngine = null;
try {
    const { getAutomationEngine } = require('../services/automationEngine');
    automationEngine = { getEngine: getAutomationEngine };
} catch (e) {
    console.log('Automation engine not available for bookings:', e.message);
}

/**
 * Create bookings routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Object} publicRateLimit - Rate limiter for public endpoints
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Generate cancellation token
     */
    const generateCancellationToken = () => crypto.randomBytes(32).toString('hex');

    /**
     * Check if a time slot is available
     */
    const isSlotAvailable = async (client, calendarId, startTime, endTime) => {
        const result = await client.query(`
      SELECT COUNT(*) FROM bookings
      WHERE calendar_id = $1
        AND status IN ('pending', 'confirmed')
        AND (
          (start_time <= $2 AND end_time > $2)
          OR (start_time < $3 AND end_time >= $3)
          OR (start_time >= $2 AND end_time <= $3)
        )
    `, [calendarId, startTime, endTime]);

        return parseInt(result.rows[0].count) === 0;
    };

    // ======================
    // Authenticated Booking Routes
    // ======================

    /**
     * GET /api/bookings
     * List bookings with filtering
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                calendar_id,
                contact_id,
                assigned_to,
                status,
                start_date,
                end_date,
                page = 1,
                limit = 50
            } = req.query;

            const offset = (parseInt(page) - 1) * parseInt(limit);
            let whereClause = 'WHERE b.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (calendar_id) {
                whereClause += ` AND b.calendar_id = $${paramIndex}`;
                params.push(parseInt(calendar_id));
                paramIndex++;
            }

            if (contact_id) {
                whereClause += ` AND b.contact_id = $${paramIndex}`;
                params.push(parseInt(contact_id));
                paramIndex++;
            }

            if (assigned_to) {
                whereClause += ` AND b.assigned_to = $${paramIndex}`;
                params.push(parseInt(assigned_to));
                paramIndex++;
            }

            if (status) {
                whereClause += ` AND b.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (start_date) {
                whereClause += ` AND b.start_time >= $${paramIndex}`;
                params.push(start_date);
                paramIndex++;
            }

            if (end_date) {
                whereClause += ` AND b.start_time <= $${paramIndex}`;
                params.push(end_date);
                paramIndex++;
            }

            const client = await pool.connect();

            // Get total count
            const countResult = await client.query(
                `SELECT COUNT(*) FROM bookings b ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].count);

            // Get bookings
            const result = await client.query(`
        SELECT b.*,
               c.name as calendar_name, c.color as calendar_color,
               ct.first_name as contact_first_name, ct.last_name as contact_last_name, ct.email as contact_email,
               u.name as assigned_to_name
        FROM bookings b
        LEFT JOIN calendars c ON b.calendar_id = c.id
        LEFT JOIN contacts ct ON b.contact_id = ct.id
        LEFT JOIN users u ON b.assigned_to = u.id
        ${whereClause}
        ORDER BY b.start_time DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                bookings: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching bookings:', error);
            res.status(500).json({ error: 'Failed to fetch bookings' });
        }
    });

    /**
     * GET /api/bookings/:id
     * Get a single booking
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
        SELECT b.*,
               c.name as calendar_name, c.slug as calendar_slug,
               ct.first_name as contact_first_name, ct.last_name as contact_last_name, 
               ct.email as contact_email, ct.phone as contact_phone,
               u.name as assigned_to_name
        FROM bookings b
        LEFT JOIN calendars c ON b.calendar_id = c.id
        LEFT JOIN contacts ct ON b.contact_id = ct.id
        LEFT JOIN users u ON b.assigned_to = u.id
        WHERE b.id = $1 AND b.organization_id = $2
      `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching booking:', error);
            res.status(500).json({ error: 'Failed to fetch booking' });
        }
    });

    /**
     * POST /api/bookings
     * Create a booking (manual)
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                calendar_id,
                contact_id,
                title,
                start_time,
                end_time,
                timezone,
                attendee_name,
                attendee_email,
                attendee_phone,
                assigned_to,
                notes,
                internal_notes,
                custom_fields
            } = req.body;

            if (!calendar_id || !start_time || !end_time) {
                return res.status(400).json({ error: 'calendar_id, start_time, and end_time are required' });
            }

            const client = await pool.connect();

            // Verify calendar exists
            const calendarCheck = await client.query(
                'SELECT id, assigned_to FROM calendars WHERE id = $1 AND organization_id = $2',
                [calendar_id, req.organizationId]
            );

            if (calendarCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Calendar not found' });
            }

            // Check slot availability
            const available = await isSlotAvailable(client, calendar_id, start_time, end_time);
            if (!available) {
                client.release();
                return res.status(409).json({ error: 'Time slot is not available' });
            }

            const cancellationToken = generateCancellationToken();
            const bookingAssignedTo = assigned_to || calendarCheck.rows[0].assigned_to;

            const result = await client.query(`
        INSERT INTO bookings (
          organization_id, calendar_id, contact_id, title,
          start_time, end_time, timezone,
          attendee_name, attendee_email, attendee_phone,
          assigned_to, notes, internal_notes, custom_fields,
          cancellation_token, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'manual')
        RETURNING *
      `, [
                req.organizationId,
                calendar_id,
                contact_id || null,
                title || null,
                start_time,
                end_time,
                timezone || 'America/New_York',
                attendee_name || null,
                attendee_email || null,
                attendee_phone || null,
                bookingAssignedTo,
                notes || null,
                internal_notes || null,
                JSON.stringify(custom_fields || {}),
                cancellationToken
            ]);

            client.release();

            // Fire automation trigger
            if (automationEngine) {
                try {
                    const engine = automationEngine.getEngine();
                    engine.handleTrigger('booking_created', {
                        booking: result.rows[0],
                        contact: contact_id ? { id: contact_id } : null,
                        organizationId: req.organizationId,
                        calendar: { id: calendar_id }
                    }).catch(err => console.error('Booking automation trigger error:', err));
                } catch (triggerError) {
                    console.log('Automation engine not initialized yet');
                }
            }

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating booking:', error);
            res.status(500).json({ error: 'Failed to create booking' });
        }
    });

    /**
     * PATCH /api/bookings/:id/cancel
     * Cancel a booking
     */
    router.patch('/:id/cancel', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
        UPDATE bookings SET
          status = 'cancelled',
          cancelled_at = CURRENT_TIMESTAMP,
          cancellation_reason = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND organization_id = $3
        RETURNING *
      `, [reason || null, id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Fire automation trigger
            if (automationEngine) {
                try {
                    const engine = automationEngine.getEngine();
                    const booking = result.rows[0];
                    engine.handleTrigger('booking_cancelled', {
                        booking,
                        contact: booking.contact_id ? { id: booking.contact_id } : null,
                        organizationId: req.organizationId,
                        reason: reason || 'No reason provided'
                    }).catch(err => console.error('Booking cancellation trigger error:', err));
                } catch (triggerError) {
                    console.log('Automation engine not initialized yet');
                }
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error cancelling booking:', error);
            res.status(500).json({ error: 'Failed to cancel booking' });
        }
    });

    /**
     * PATCH /api/bookings/:id/reschedule
     * Reschedule a booking
     */
    router.patch('/:id/reschedule', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { start_time, end_time, timezone } = req.body;

            if (!start_time || !end_time) {
                return res.status(400).json({ error: 'start_time and end_time are required' });
            }

            const client = await pool.connect();

            // Get current booking
            const currentBooking = await client.query(
                'SELECT * FROM bookings WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (currentBooking.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Booking not found' });
            }

            const oldBooking = currentBooking.rows[0];

            // Check new slot availability
            const available = await isSlotAvailable(client, oldBooking.calendar_id, start_time, end_time);
            if (!available) {
                client.release();
                return res.status(409).json({ error: 'New time slot is not available' });
            }

            const result = await client.query(`
        UPDATE bookings SET
          start_time = $1,
          end_time = $2,
          timezone = COALESCE($3, timezone),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND organization_id = $5
        RETURNING *
      `, [start_time, end_time, timezone, id, req.organizationId]);

            client.release();

            // Fire automation trigger
            if (automationEngine) {
                try {
                    const engine = automationEngine.getEngine();
                    const booking = result.rows[0];
                    engine.handleTrigger('booking_rescheduled', {
                        booking,
                        contact: booking.contact_id ? { id: booking.contact_id } : null,
                        organizationId: req.organizationId,
                        oldTime: { start: oldBooking.start_time, end: oldBooking.end_time },
                        newTime: { start: start_time, end: end_time }
                    }).catch(err => console.error('Booking reschedule trigger error:', err));
                } catch (triggerError) {
                    console.log('Automation engine not initialized yet');
                }
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error rescheduling booking:', error);
            res.status(500).json({ error: 'Failed to reschedule booking' });
        }
    });

    // ======================
    // Public Booking Routes
    // ======================

    /**
     * GET /api/public/book/:slug
     * Get public calendar info for booking page
     */
    router.get('/public/book/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
        SELECT 
          c.id, c.name, c.description, c.slug, c.timezone,
          c.duration_minutes, c.min_notice_hours, c.max_future_days,
          c.color, c.is_active,
          o.name as organization_name
        FROM calendars c
        JOIN organizations o ON c.organization_id = o.id
        WHERE c.slug = $1 AND c.is_active = TRUE
      `, [slug]);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Calendar not found' });
            }

            // Get availability windows
            const calendar = result.rows[0];
            const availabilityResult = await client.query(`
        SELECT day_of_week, start_time, end_time
        FROM availability_windows
        WHERE calendar_id = $1 AND is_active = TRUE
        ORDER BY day_of_week, start_time
      `, [calendar.id]);

            client.release();

            calendar.availability = availabilityResult.rows;

            res.json(calendar);
        } catch (error) {
            console.error('Error fetching public calendar:', error);
            res.status(500).json({ error: 'Failed to load booking page' });
        }
    });

    /**
     * GET /api/public/book/:slug/slots
     * Get available time slots for a date range
     */
    router.get('/public/book/:slug/slots', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const { start_date, end_date } = req.query;

            if (!start_date) {
                return res.status(400).json({ error: 'start_date is required' });
            }

            const client = await pool.connect();

            // Get calendar
            const calendarResult = await client.query(`
        SELECT id, duration_minutes, buffer_before_minutes, buffer_after_minutes,
               min_notice_hours, timezone
        FROM calendars
        WHERE slug = $1 AND is_active = TRUE
      `, [slug]);

            if (calendarResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Calendar not found' });
            }

            const calendar = calendarResult.rows[0];

            // Get availability windows
            const availabilityResult = await client.query(`
        SELECT day_of_week, start_time, end_time
        FROM availability_windows
        WHERE calendar_id = $1 AND is_active = TRUE
      `, [calendar.id]);

            // Get date overrides
            const overridesResult = await client.query(`
        SELECT override_date, is_available, start_time, end_time
        FROM calendar_date_overrides
        WHERE calendar_id = $1 AND override_date >= $2 AND override_date <= COALESCE($3, $2 + INTERVAL '30 days')
      `, [calendar.id, start_date, end_date]);

            // Get existing bookings
            const bookingsResult = await client.query(`
        SELECT start_time, end_time
        FROM bookings
        WHERE calendar_id = $1 
          AND status IN ('pending', 'confirmed')
          AND start_time >= $2
          AND start_time <= COALESCE($3, $2::date + INTERVAL '30 days')
      `, [calendar.id, start_date, end_date]);

            client.release();

            // Return raw data for frontend to compute slots
            res.json({
                calendar: {
                    id: calendar.id,
                    duration_minutes: calendar.duration_minutes,
                    buffer_before: calendar.buffer_before_minutes,
                    buffer_after: calendar.buffer_after_minutes,
                    min_notice_hours: calendar.min_notice_hours,
                    timezone: calendar.timezone
                },
                availability: availabilityResult.rows,
                overrides: overridesResult.rows,
                booked_slots: bookingsResult.rows
            });
        } catch (error) {
            console.error('Error fetching available slots:', error);
            res.status(500).json({ error: 'Failed to fetch available slots' });
        }
    });

    /**
     * POST /api/public/book/:slug
     * Submit a public booking
     */
    router.post('/public/book/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
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

            const client = await pool.connect();

            // Get calendar
            const calendarResult = await client.query(`
        SELECT id, organization_id, duration_minutes, assigned_to, min_notice_hours
        FROM calendars
        WHERE slug = $1 AND is_active = TRUE
      `, [slug]);

            if (calendarResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Calendar not found' });
            }

            const calendar = calendarResult.rows[0];

            // Calculate end_time if not provided
            const bookingEndTime = end_time || new Date(
                new Date(start_time).getTime() + calendar.duration_minutes * 60000
            ).toISOString();

            // Check slot availability
            const available = await isSlotAvailable(client, calendar.id, start_time, bookingEndTime);
            if (!available) {
                client.release();
                return res.status(409).json({ error: 'This time slot is no longer available' });
            }

            const cancellationToken = generateCancellationToken();

            // Try to find or create contact
            let contactId = null;
            try {
                const existingContact = await client.query(
                    'SELECT id FROM contacts WHERE organization_id = $1 AND email = $2',
                    [calendar.organization_id, attendee_email]
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
          `, [calendar.organization_id, firstName, lastName, attendee_email, attendee_phone]);

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
          cancellation_token, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'booking_page')
        RETURNING id, start_time, end_time, timezone, attendee_name, attendee_email, cancellation_token
      `, [
                calendar.organization_id,
                calendar.id,
                contactId,
                start_time,
                bookingEndTime,
                timezone || 'America/New_York',
                attendee_name,
                attendee_email,
                attendee_phone || null,
                calendar.assigned_to,
                notes || null,
                JSON.stringify(custom_fields || {}),
                cancellationToken
            ]);

            client.release();

            // Fire automation trigger
            if (automationEngine) {
                try {
                    const engine = automationEngine.getEngine();
                    engine.handleTrigger('booking_created', {
                        booking: result.rows[0],
                        contact: contactId ? { id: contactId } : null,
                        organizationId: calendar.organization_id,
                        calendar: { id: calendar.id }
                    }).catch(err => console.error('Public booking trigger error:', err));
                } catch (triggerError) {
                    console.log('Automation engine not initialized yet');
                }
            }

            res.status(201).json({
                success: true,
                booking: result.rows[0],
                message: 'Booking confirmed! Check your email for confirmation details.'
            });
        } catch (error) {
            console.error('Error creating public booking:', error);
            res.status(500).json({ error: 'Failed to create booking' });
        }
    });

    /**
     * POST /api/public/book/:slug/cancel/:token
     * Cancel a booking using cancellation token
     */
    router.post('/public/book/:slug/cancel/:token', publicRateLimit, async (req, res) => {
        try {
            const { slug, token } = req.params;
            const { reason } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
        UPDATE bookings SET
          status = 'cancelled',
          cancelled_at = CURRENT_TIMESTAMP,
          cancellation_reason = $1,
          updated_at = CURRENT_TIMESTAMP
        FROM calendars c
        WHERE bookings.calendar_id = c.id
          AND c.slug = $2
          AND bookings.cancellation_token = $3
          AND bookings.status = 'confirmed'
        RETURNING bookings.*
      `, [reason || 'Cancelled by attendee', slug, token]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Booking not found or already cancelled' });
            }

            res.json({
                success: true,
                message: 'Your booking has been cancelled.'
            });
        } catch (error) {
            console.error('Error cancelling booking:', error);
            res.status(500).json({ error: 'Failed to cancel booking' });
        }
    });

    return router;
};
