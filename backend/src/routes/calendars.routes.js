/**
 * Calendars Routes
 * CRUD operations for calendar management
 * Refactored with shared middleware (Phase 5)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendError } = require('../utils/response');

/**
 * Create calendars routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    // Use shared organization middleware (Phase 5.3)
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Generate URL-friendly slug
     */
    const generateSlug = (name) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + crypto.randomBytes(4).toString('hex');
    };

    // ======================
    // Calendar CRUD
    // ======================

    /**
     * GET /api/calendars
     * List all calendars for the organization
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(`
        SELECT c.*,
               u.name as assigned_to_name,
               (SELECT COUNT(*) FROM bookings WHERE calendar_id = c.id AND status = 'confirmed') as upcoming_bookings
        FROM calendars c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.organization_id = $1
        ORDER BY c.created_at DESC
      `, [req.organizationId]));
            res.json({ calendars: result.rows });
        } catch (error) {
            console.error('Error fetching calendars:', error);
            return sendError(res, 'Failed to fetch calendars');
        }
    });

    /**
     * GET /api/calendars/:id
     * Get a single calendar with availability windows
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                // Get calendar
                const calendarResult = await client.query(`
        SELECT c.*,
               u.name as assigned_to_name
        FROM calendars c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.id = $1 AND c.organization_id = $2
      `, [id, req.organizationId]);

                if (calendarResult.rows.length === 0) {
                    return { calendar: null, availability: [], overrides: [] };
                }

                // Get availability windows
                const availabilityResult = await client.query(`
        SELECT * FROM availability_windows
        WHERE calendar_id = $1
        ORDER BY day_of_week, start_time
      `, [id]);

                // Get date overrides
                const overridesResult = await client.query(`
        SELECT * FROM calendar_date_overrides
        WHERE calendar_id = $1 AND override_date >= CURRENT_DATE
        ORDER BY override_date
      `, [id]);

                return {
                    calendar: calendarResult.rows[0],
                    availability: availabilityResult.rows,
                    overrides: overridesResult.rows,
                };
            });

            if (!data.calendar) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            const calendar = data.calendar;
            calendar.availability_windows = data.availability;
            calendar.date_overrides = data.overrides;

            res.json(calendar);
        } catch (error) {
            console.error('Error fetching calendar:', error);
            return sendError(res, 'Failed to fetch calendar');
        }
    });

    /**
     * POST /api/calendars
     * Create a new calendar
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                description,
                timezone,
                duration_minutes,
                buffer_before_minutes,
                buffer_after_minutes,
                min_notice_hours,
                max_future_days,
                assigned_to,
                assignment_mode,
                confirmation_email,
                reminder_email,
                reminder_hours,
                color,
                availability_windows
            } = req.body;

            if (!name || name.trim().length === 0) {
                return res.status(400).json({ error: 'Calendar name is required' });
            }

            const slug = generateSlug(name);
            const calendar = await withTransaction(pool, async (client) => {
                // Create calendar
                const calendarResult = await client.query(`
          INSERT INTO calendars (
            organization_id, name, description, slug, timezone,
            duration_minutes, buffer_before_minutes, buffer_after_minutes,
            min_notice_hours, max_future_days, assigned_to, assignment_mode,
            confirmation_email, reminder_email, reminder_hours, color, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *
        `, [
                    req.organizationId,
                    name.trim(),
                    description || null,
                    slug,
                    timezone || 'America/New_York',
                    duration_minutes || 30,
                    buffer_before_minutes || 0,
                    buffer_after_minutes || 0,
                    min_notice_hours || 24,
                    max_future_days || 60,
                    assigned_to || req.user.id,
                    assignment_mode || 'specific',
                    confirmation_email !== false,
                    reminder_email !== false,
                    reminder_hours || 24,
                    color || '#3B82F6',
                    req.user.id
                ]);

                const createdCalendar = calendarResult.rows[0];

                // Create default availability windows if provided
                if (availability_windows && Array.isArray(availability_windows)) {
                    for (const window of availability_windows) {
                        await client.query(`
              INSERT INTO availability_windows (calendar_id, day_of_week, start_time, end_time, is_active)
              VALUES ($1, $2, $3, $4, $5)
            `, [
                            createdCalendar.id,
                            window.day_of_week,
                            window.start_time,
                            window.end_time,
                            window.is_active !== false
                        ]);
                    }
                } else {
                    // Create default Mon-Fri 9am-5pm availability
                    for (let day = 1; day <= 5; day++) {
                        await client.query(`
              INSERT INTO availability_windows (calendar_id, day_of_week, start_time, end_time)
              VALUES ($1, $2, '09:00', '17:00')
            `, [createdCalendar.id, day]);
                    }
                }
                return createdCalendar;
            });

            res.status(201).json(calendar);
        } catch (error) {
            console.error('Error creating calendar:', error);
            return sendError(res, 'Failed to create calendar');
        }
    });

    /**
     * PUT /api/calendars/:id
     * Update a calendar
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                description,
                timezone,
                duration_minutes,
                buffer_before_minutes,
                buffer_after_minutes,
                min_notice_hours,
                max_future_days,
                assigned_to,
                assignment_mode,
                confirmation_email,
                reminder_email,
                reminder_hours,
                color,
                is_active
            } = req.body;

            const result = await withDbClient(pool, async (client) => client.query(`
        UPDATE calendars SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          timezone = COALESCE($3, timezone),
          duration_minutes = COALESCE($4, duration_minutes),
          buffer_before_minutes = COALESCE($5, buffer_before_minutes),
          buffer_after_minutes = COALESCE($6, buffer_after_minutes),
          min_notice_hours = COALESCE($7, min_notice_hours),
          max_future_days = COALESCE($8, max_future_days),
          assigned_to = $9,
          assignment_mode = COALESCE($10, assignment_mode),
          confirmation_email = COALESCE($11, confirmation_email),
          reminder_email = COALESCE($12, reminder_email),
          reminder_hours = COALESCE($13, reminder_hours),
          color = COALESCE($14, color),
          is_active = COALESCE($15, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $16 AND organization_id = $17
        RETURNING *
      `, [
                name?.trim(),
                description,
                timezone,
                duration_minutes,
                buffer_before_minutes,
                buffer_after_minutes,
                min_notice_hours,
                max_future_days,
                assigned_to,
                assignment_mode,
                confirmation_email,
                reminder_email,
                reminder_hours,
                color,
                is_active,
                id,
                req.organizationId
            ]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating calendar:', error);
            return sendError(res, 'Failed to update calendar');
        }
    });

    /**
     * DELETE /api/calendars/:id
     * Delete a calendar
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                // Check for upcoming bookings
                const bookingsCheck = await client.query(
                    `SELECT COUNT(*) FROM bookings 
         WHERE calendar_id = $1 AND status = 'confirmed' AND start_time > NOW()`,
                    [id]
                );

                if (parseInt(bookingsCheck.rows[0].count) > 0) {
                    return { error: 'Cannot delete calendar with upcoming bookings. Cancel bookings first.', result: null };
                }

                const deleteResult = await client.query(
                    'DELETE FROM calendars WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );

                return { error: null, result: deleteResult };
            });

            if (data.error) {
                return res.status(400).json({ error: data.error });
            }

            if (data.result.rows.length === 0) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            res.json({ message: 'Calendar deleted successfully' });
        } catch (error) {
            console.error('Error deleting calendar:', error);
            return sendError(res, 'Failed to delete calendar');
        }
    });

    // ======================
    // Availability Management
    // ======================

    /**
     * PUT /api/calendars/:id/availability
     * Update availability windows for a calendar
     */
    router.put('/:id/availability', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { availability_windows } = req.body;

            if (!Array.isArray(availability_windows)) {
                return res.status(400).json({ error: 'availability_windows must be an array' });
            }

            const data = await withTransaction(pool, async (client) => {
                // Verify calendar exists
                const calendarCheck = await client.query(
                    'SELECT id FROM calendars WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (calendarCheck.rows.length === 0) {
                    return { exists: false, windows: [] };
                }

                // Delete existing windows
                await client.query('DELETE FROM availability_windows WHERE calendar_id = $1', [id]);

                // Insert new windows
                for (const window of availability_windows) {
                    await client.query(`
            INSERT INTO availability_windows (calendar_id, day_of_week, start_time, end_time, is_active)
            VALUES ($1, $2, $3, $4, $5)
          `, [
                        id,
                        window.day_of_week,
                        window.start_time,
                        window.end_time,
                        window.is_active !== false
                    ]);
                }
                // Fetch updated windows
                const result = await client.query(
                    'SELECT * FROM availability_windows WHERE calendar_id = $1 ORDER BY day_of_week, start_time',
                    [id]
                );

                return { exists: true, windows: result.rows };
            });

            if (!data.exists) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            res.json({ availability_windows: data.windows });
        } catch (error) {
            console.error('Error updating availability:', error);
            return sendError(res, 'Failed to update availability');
        }
    });

    /**
     * POST /api/calendars/:id/date-override
     * Add a date override (block or customize a specific date)
     */
    router.post('/:id/date-override', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { override_date, is_available, start_time, end_time, reason } = req.body;

            if (!override_date) {
                return res.status(400).json({ error: 'override_date is required' });
            }

            const data = await withDbClient(pool, async (client) => {
                // Verify calendar exists
                const calendarCheck = await client.query(
                    'SELECT id FROM calendars WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (calendarCheck.rows.length === 0) {
                    return { exists: false, result: null };
                }

                // Upsert override
                const result = await client.query(`
        INSERT INTO calendar_date_overrides (calendar_id, override_date, is_available, start_time, end_time, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (calendar_id, override_date) 
        DO UPDATE SET is_available = $3, start_time = $4, end_time = $5, reason = $6
        RETURNING *
      `, [id, override_date, is_available || false, start_time, end_time, reason]);

                return { exists: true, result };
            });

            if (!data.exists) {
                return res.status(404).json({ error: 'Calendar not found' });
            }

            res.json(data.result.rows[0]);
        } catch (error) {
            console.error('Error creating date override:', error);
            return sendError(res, 'Failed to create date override');
        }
    });

    /**
     * DELETE /api/calendars/:id/date-override/:overrideId
     * Remove a date override
     */
    router.delete('/:id/date-override/:overrideId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id, overrideId } = req.params;

            const result = await withDbClient(pool, async (client) => client.query(`
        DELETE FROM calendar_date_overrides 
        WHERE id = $1 AND calendar_id = $2
        RETURNING id
      `, [overrideId, id]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Date override not found' });
            }

            res.json({ message: 'Date override removed' });
        } catch (error) {
            console.error('Error deleting date override:', error);
            return sendError(res, 'Failed to delete date override');
        }
    });

    return router;
};
