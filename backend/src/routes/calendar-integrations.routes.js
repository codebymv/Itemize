/**
 * Calendar Integrations Routes
 * Handles external calendar connections (Google, Outlook) OAuth and sync
 */
const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendarService');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');

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
            const client = await pool.connect();
            const result = await client.query(`
                SELECT 
                    id, provider, provider_email, sync_enabled, sync_direction,
                    last_sync_at, is_active, error_message, selected_calendars,
                    created_at, updated_at
                FROM calendar_connections
                WHERE user_id = $1 AND organization_id = $2
                ORDER BY created_at DESC
            `, [req.user.id, req.organizationId]);
            client.release();

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching calendar connections:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * DELETE /api/calendar-integrations/connections/:id
     * Disconnect a calendar integration
     */
    router.delete('/connections/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(`
                DELETE FROM calendar_connections
                WHERE id = $1 AND user_id = $2 AND organization_id = $3
                RETURNING id
            `, [req.params.id, req.user.id, req.organizationId]);
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            res.json({ message: 'Calendar disconnected successfully' });
        } catch (error) {
            console.error('Error disconnecting calendar:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * PATCH /api/calendar-integrations/connections/:id
     * Update connection settings
     */
    router.patch('/connections/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { sync_enabled, sync_direction, selected_calendars } = req.body;

            const client = await pool.connect();
            const result = await client.query(`
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
            ]);
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating connection:', error);
            res.status(500).json({ error: 'Internal server error' });
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
            const state = {
                userId: req.user.id,
                organizationId: req.organizationId,
                returnUrl: req.query.return_url || '/calendars',
            };

            const authUrl = googleCalendarService.getAuthUrl(state);
            res.json({ authUrl });
        } catch (error) {
            console.error('Error generating Google auth URL:', error);
            res.status(500).json({ error: 'Failed to initiate Google authentication' });
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
                stateData = JSON.parse(state);
            } catch {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/calendars?error=invalid_state`);
            }

            const { userId, organizationId, returnUrl } = stateData;

            // Exchange code for tokens
            const tokens = await googleCalendarService.exchangeCodeForTokens(code);

            // Get user info from Google
            const userInfo = await googleCalendarService.getUserInfo(tokens.access_token);

            // Calculate token expiry
            const tokenExpiresAt = tokens.expiry_date
                ? new Date(tokens.expiry_date)
                : new Date(Date.now() + 3600 * 1000);

            // Save connection to database
            const client = await pool.connect();

            // Check for existing connection
            const existingResult = await client.query(
                `SELECT id FROM calendar_connections 
                 WHERE user_id = $1 AND provider = 'google' AND provider_account_id = $2`,
                [userId, userInfo.id]
            );

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
                        updated_at = NOW()
                    WHERE id = $5
                `, [
                    tokens.access_token,
                    tokens.refresh_token,
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
                    tokens.access_token,
                    tokens.refresh_token,
                    tokenExpiresAt
                ]);
            }

            client.release();

            // Redirect to frontend
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            res.redirect(`${frontendUrl}${returnUrl || '/calendars'}?google_connected=true`);
        } catch (error) {
            console.error('Error in Google OAuth callback:', error);
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
            const client = await pool.connect();
            const connectionResult = await client.query(
                `SELECT * FROM calendar_connections 
                 WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
                [req.params.connectionId, req.user.id, req.organizationId]
            );
            client.release();

            if (connectionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }

            const connection = connectionResult.rows[0];

            // Check if tokens need refresh
            if (googleCalendarService.needsTokenRefresh(connection.token_expires_at)) {
                const newTokens = await googleCalendarService.refreshAccessToken(connection.refresh_token);
                connection.access_token = newTokens.access_token;

                // Update tokens in database
                const updateClient = await pool.connect();
                await updateClient.query(`
                    UPDATE calendar_connections
                    SET access_token = $1, token_expires_at = $2, updated_at = NOW()
                    WHERE id = $3
                `, [newTokens.access_token, new Date(newTokens.expiry_date), connection.id]);
                updateClient.release();
            }

            const calendars = await googleCalendarService.listCalendars(
                connection.access_token,
                connection.refresh_token
            );

            res.json(calendars);
        } catch (error) {
            console.error('Error listing Google calendars:', error);
            res.status(500).json({ error: 'Failed to fetch calendars' });
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
            const client = await pool.connect();
            const connectionResult = await client.query(
                `SELECT * FROM calendar_connections 
                 WHERE id = $1 AND user_id = $2 AND organization_id = $3 AND is_active = TRUE`,
                [req.params.connectionId, req.user.id, req.organizationId]
            );

            if (connectionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Connection not found or inactive' });
            }

            const connection = connectionResult.rows[0];

            // Check if tokens need refresh
            if (googleCalendarService.needsTokenRefresh(connection.token_expires_at)) {
                const newTokens = await googleCalendarService.refreshAccessToken(connection.refresh_token);
                connection.access_token = newTokens.access_token;

                await client.query(`
                    UPDATE calendar_connections
                    SET access_token = $1, token_expires_at = $2, updated_at = NOW()
                    WHERE id = $3
                `, [newTokens.access_token, new Date(newTokens.expiry_date), connection.id]);
            }

            // Get upcoming bookings that need syncing
            const bookingsResult = await client.query(`
                SELECT b.* FROM bookings b
                LEFT JOIN calendar_sync_events cse ON cse.booking_id = b.id AND cse.connection_id = $1
                WHERE b.organization_id = $2
                  AND b.status IN ('confirmed', 'pending')
                  AND b.start_time >= NOW()
                  AND (cse.id IS NULL OR cse.last_synced_at < b.updated_at)
                ORDER BY b.start_time ASC
                LIMIT 100
            `, [connection.id, req.organizationId]);

            client.release();

            if (bookingsResult.rows.length === 0) {
                return res.json({
                    message: 'No bookings to sync',
                    results: { created: 0, updated: 0, failed: 0 }
                });
            }

            // Sync bookings to Google
            const results = await googleCalendarService.syncBookingsToGoogle(
                pool,
                connection,
                bookingsResult.rows
            );

            res.json({
                message: 'Sync completed',
                results
            });
        } catch (error) {
            console.error('Error syncing calendar:', error);
            res.status(500).json({ error: 'Sync failed' });
        }
    });

    /**
     * GET /api/calendar-integrations/sync-status/:connectionId
     * Get sync status for a connection
     */
    router.get('/sync-status/:connectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();

            // Get connection info
            const connectionResult = await client.query(
                `SELECT id, last_sync_at, error_message, error_count, sync_enabled
                 FROM calendar_connections 
                 WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
                [req.params.connectionId, req.user.id, req.organizationId]
            );

            if (connectionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Connection not found' });
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

            client.release();

            res.json({
                connection: connectionResult.rows[0],
                stats: statsResult.rows[0]
            });
        } catch (error) {
            console.error('Error getting sync status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
