/**
 * Calendar Integrations Routes
 * Handles Google Calendar OAuth and live provider-calendar discovery
 */
const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendarService');
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');
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

    return router;
};
