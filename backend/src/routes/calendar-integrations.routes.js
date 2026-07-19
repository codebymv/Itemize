/**
 * Calendar Integrations Routes
 * Handles external calendar connections (Google, Outlook) OAuth and sync
 */
const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendarService');
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');
const { bookingColumns } = require('./calendar-columns');
const { createCalendarOAuthState, verifyCalendarOAuthState } = require('../services/calendarOAuthState');
const { encryptCalendarToken } = require('../utils/calendarTokenEncryption');
const { loadGoogleCalendarConnection } = require('../services/calendarConnectionCredentials');
const { logger } = require('../utils/logger');

const logCalendarIntegrationError = (operation, error) => {
    logger.error('Calendar integration request failed', {
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: error?.code,
        status: error?.response?.status,
    });
};

/**
 * Create calendar integrations routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    // ======================
    // Connection Management
    // ======================

    /**
     * GET /api/calendar-integrations/connections
     * List all calendar connections for the user
     */
    router.get('/connections', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(`
                SELECT 
                    id, provider, provider_email, sync_enabled, sync_direction,
                    last_sync_at, is_active, error_message, selected_calendars,
                    created_at, updated_at
                FROM calendar_connections
                WHERE user_id = $1 AND organization_id = $2
                ORDER BY created_at DESC
            `, [req.user.id, req.organizationId]));

            res.json(result.rows);
        } catch (error) {
            logCalendarIntegrationError('listConnections', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * DELETE /api/calendar-integrations/connections/:id
     * Disconnect a calendar integration
     */
    router.delete('/connections/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(`
                DELETE FROM calendar_connections
                WHERE id = $1 AND user_id = $2 AND organization_id = $3
                RETURNING id
            `, [req.params.id, req.user.id, req.organizationId]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            res.json({ message: 'Calendar disconnected successfully' });
        } catch (error) {
            logCalendarIntegrationError('disconnectConnection', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * PATCH /api/calendar-integrations/connections/:id
     * Update connection settings
     */
    router.patch('/connections/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { sync_enabled, sync_direction, selected_calendars } = req.body;

            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE calendar_connections
                SET 
                    sync_enabled = COALESCE($1, sync_enabled),
                    sync_direction = COALESCE($2, sync_direction),
                    selected_calendars = COALESCE($3, selected_calendars),
                    updated_at = NOW()
                WHERE id = $4 AND user_id = $5 AND organization_id = $6
                RETURNING id, provider, provider_email, sync_enabled, sync_direction, selected_calendars
            `, [
                sync_enabled,
                sync_direction,
                selected_calendars ? JSON.stringify(selected_calendars) : null,
                req.params.id,
                req.user.id,
                req.organizationId
            ]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            logCalendarIntegrationError('updateConnection', error);
            return sendError(res, 'Internal server error');
        }
    });

    // ======================
    // Google Calendar OAuth
    // ======================

    /**
     * GET /api/calendar-integrations/google/auth
     * Initiate Google OAuth flow
     */
    router.get('/google/auth', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const state = createCalendarOAuthState({
                userId: req.user.id,
                organizationId: req.organizationId,
                returnUrl: req.query.return_url || '/calendars',
            });

            const authUrl = googleCalendarService.getAuthUrl(state);
            res.json({ authUrl });
        } catch (error) {
            logCalendarIntegrationError('beginGoogleOAuth', error);
            return sendError(res, 'Failed to initiate Google authentication');
        }
    });

    /**
     * GET /api/calendar-integrations/google/callback
     * Handle Google OAuth callback
     */
    router.get('/google/callback', async (req, res) => {
        try {
            const { code, state } = req.query;

            if (!code) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/calendars?error=no_code`);
            }

            let stateData;
            try {
                stateData = verifyCalendarOAuthState(state);
            } catch {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/calendars?error=invalid_state`);
            }

            const { userId, organizationId, returnPath } = stateData;

            const membership = await withDbClient(pool, async (client) => client.query(`
                SELECT 1 FROM organization_members
                WHERE user_id = $1 AND organization_id = $2
            `, [userId, organizationId]));
            if (membership.rows.length === 0) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/calendars?error=invalid_state`);
            }

            // Exchange code for tokens
            const tokens = await googleCalendarService.exchangeCodeForTokens(code);

            // Get user info from Google
            const userInfo = await googleCalendarService.getUserInfo(tokens.access_token);

            // Calculate token expiry
            const tokenExpiresAt = tokens.expiry_date
                ? new Date(tokens.expiry_date)
                : new Date(Date.now() + 3600 * 1000);

            // Save connection to database
            await withDbClient(pool, async (client) => {
                // Check for existing connection
                const existingResult = await client.query(
                    `SELECT id FROM calendar_connections 
                 WHERE user_id = $1 AND organization_id = $2
                   AND provider = 'google' AND provider_account_id = $3`,
                    [userId, organizationId, userInfo.id]
                );

                const encryptedAccessToken = encryptCalendarToken(tokens.access_token, 'access');
                const encryptedRefreshToken = tokens.refresh_token
                    ? encryptCalendarToken(tokens.refresh_token, 'refresh')
                    : null;

                if (existingResult.rows.length > 0) {
                    // Update existing connection
                    await client.query(`
                    UPDATE calendar_connections
                    SET 
                        access_token = $1,
                        refresh_token = COALESCE($2, refresh_token),
                        token_expires_at = $3,
                        provider_email = $4,
                        is_active = TRUE,
                        error_message = NULL,
                        error_count = 0,
                        token_generation = token_generation + 1,
                        updated_at = NOW()
                    WHERE id = $5
                `, [
                        encryptedAccessToken,
                        encryptedRefreshToken,
                        tokenExpiresAt,
                        userInfo.email,
                        existingResult.rows[0].id
                    ]);
                } else {
                    // Create new connection
                    await client.query(`
                    INSERT INTO calendar_connections (
                        user_id, organization_id, provider, provider_account_id,
                        provider_email, access_token, refresh_token, token_expires_at
                    ) VALUES ($1, $2, 'google', $3, $4, $5, $6, $7)
                `, [
                        userId,
                        organizationId,
                        userInfo.id,
                        userInfo.email,
                        encryptedAccessToken,
                        encryptedRefreshToken,
                        tokenExpiresAt
                    ]);
                }
            });

            // Redirect to frontend
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const separator = returnPath.includes('?') ? '&' : '?';
            res.redirect(`${frontendUrl}${returnPath}${separator}google_connected=true`);
        } catch (error) {
            logCalendarIntegrationError('googleOAuthCallback', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            res.redirect(`${frontendUrl}/calendars?error=oauth_failed`);
        }
    });

    /**
     * GET /api/calendar-integrations/google/calendars/:connectionId
     * List available Google calendars for a connection
     */
    router.get('/google/calendars/:connectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const connection = await loadGoogleCalendarConnection(pool, {
                connectionId: req.params.connectionId,
                userId: req.user.id,
                organizationId: req.organizationId,
            });
            if (!connection) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            const calendars = await googleCalendarService.listCalendars(
                connection.access_token,
                connection.refresh_token
            );

            res.json(calendars);
        } catch (error) {
            logCalendarIntegrationError('listGoogleCalendars', error);
            return sendError(res, 'Failed to fetch calendars');
        }
    });

    // ======================
    // Sync Operations
    // ======================

    /**
     * POST /api/calendar-integrations/sync/:connectionId
     * Trigger sync for a connection
     */
    router.post('/sync/:connectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const connection = await loadGoogleCalendarConnection(pool, {
                connectionId: req.params.connectionId,
                userId: req.user.id,
                organizationId: req.organizationId,
                requireActive: true,
            });
            if (!connection) {
                return res.status(404).json({ error: 'Connection not found or inactive' });
            }

            const bookings = await withDbClient(pool, async (client) => {
                // Get upcoming bookings that need syncing
                const bookingsResult = await client.query(`
                SELECT ${bookingColumns('b')} FROM bookings b
                LEFT JOIN calendar_sync_events cse ON cse.booking_id = b.id AND cse.connection_id = $1
                WHERE b.organization_id = $2
                  AND b.status IN ('confirmed', 'pending')
                  AND b.start_time >= NOW()
                  AND (cse.id IS NULL OR cse.last_synced_at < b.updated_at)
                ORDER BY b.start_time ASC
                LIMIT 100
            `, [connection.id, req.organizationId]);
                return bookingsResult.rows;
            });

            if (bookings.length === 0) {
                return res.json({
                    message: 'No bookings to sync',
                    results: { created: 0, updated: 0, failed: 0 }
                });
            }

            // Sync bookings to Google
            const results = await googleCalendarService.syncBookingsToGoogle(
                pool,
                connection,
                bookings
            );

            res.json({
                message: 'Sync completed',
                results
            });
        } catch (error) {
            logCalendarIntegrationError('syncCalendar', error);
            return sendError(res, 'Sync failed');
        }
    });

    /**
     * GET /api/calendar-integrations/sync-status/:connectionId
     * Get sync status for a connection
     */
    router.get('/sync-status/:connectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const data = await withDbClient(pool, async (client) => {
                // Get connection info
                const connectionResult = await client.query(
                    `SELECT id, last_sync_at, error_message, error_count, sync_enabled
                 FROM calendar_connections 
                 WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
                    [req.params.connectionId, req.user.id, req.organizationId]
                );

                if (connectionResult.rows.length === 0) {
                    return { connection: null, stats: null };
                }

                // Get sync stats
                const statsResult = await client.query(`
                SELECT 
                    COUNT(*) as total_synced,
                    COUNT(*) FILTER (WHERE sync_direction = 'push') as pushed,
                    COUNT(*) FILTER (WHERE sync_direction = 'pull') as pulled,
                    MAX(last_synced_at) as last_event_sync
                FROM calendar_sync_events
                WHERE connection_id = $1
            `, [req.params.connectionId]);

                return {
                    connection: connectionResult.rows[0],
                    stats: statsResult.rows[0],
                };
            });

            if (!data.connection) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            res.json({
                connection: data.connection,
                stats: data.stats
            });
        } catch (error) {
            logCalendarIntegrationError('getSyncStatus', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
