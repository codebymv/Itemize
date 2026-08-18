const express = require('express');
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');
const { logger } = require('../utils/logger');
const {
    createStripeConnectState,
    verifyStripeConnectState,
    DEFAULT_RETURN_PATH,
} = require('../services/stripeConnectState');
const stripeConnectService = require('../services/stripeConnectService');

function frontendOrigin() {
    return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function redirectWith(res, returnPath, query) {
    const origin = frontendOrigin();
    const path = returnPath || DEFAULT_RETURN_PATH;
    const separator = path.includes('?') ? '&' : '?';
    res.redirect(`${origin}${path}${separator}${query}`);
}

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.get('/stripe/connect', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const state = createStripeConnectState({
                userId: req.user.id,
                organizationId: req.organizationId,
                returnUrl: req.query.return_url || DEFAULT_RETURN_PATH,
            });
            res.json({ authUrl: stripeConnectService.getAuthUrl(state) });
        } catch (error) {
            logger.error('Stripe Connect start failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return sendError(res, 'Failed to start Stripe connection', 400);
        }
    });

    router.get('/stripe/callback', async (req, res) => {
        const fallbackPath = DEFAULT_RETURN_PATH;
        try {
            const { code, state, error, error_description: errorDescription } = req.query;
            if (error) {
                return redirectWith(res, fallbackPath, `error=${encodeURIComponent(errorDescription || error)}`);
            }
            if (!code) {
                return redirectWith(res, fallbackPath, 'error=no_code');
            }

            let stateData;
            try {
                stateData = verifyStripeConnectState(state);
            } catch {
                return redirectWith(res, fallbackPath, 'error=invalid_state');
            }

            const { userId, organizationId, returnPath } = stateData;
            const membership = await withDbClient(pool, async (client) => client.query(`
                SELECT 1 FROM organization_members
                WHERE user_id = $1 AND organization_id = $2
            `, [userId, organizationId]));
            if (membership.rows.length === 0) {
                return redirectWith(res, returnPath, 'error=invalid_state');
            }

            const account = await stripeConnectService.exchangeCodeForAccount(code);
            await withDbClient(pool, async (client) => client.query(`
                INSERT INTO payment_settings (
                    organization_id, stripe_account_id, stripe_publishable_key,
                    stripe_connected, stripe_connected_at
                ) VALUES ($1, $2, $3, TRUE, NOW())
                ON CONFLICT (organization_id) DO UPDATE SET
                    stripe_account_id = EXCLUDED.stripe_account_id,
                    stripe_publishable_key = EXCLUDED.stripe_publishable_key,
                    stripe_connected = TRUE,
                    stripe_connected_at = NOW(),
                    updated_at = NOW()
            `, [organizationId, account.stripeAccountId, account.stripePublishableKey]));

            return redirectWith(res, returnPath, 'stripe_connected=true');
        } catch (error) {
            logger.error('Stripe Connect callback failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return redirectWith(res, fallbackPath, 'error=oauth_failed');
        }
    });

    router.post('/stripe/disconnect', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const current = await withDbClient(pool, async (client) => {
                const result = await client.query(`
                    SELECT stripe_account_id FROM payment_settings
                    WHERE organization_id = $1
                `, [req.organizationId]);
                await client.query(`
                    UPDATE payment_settings
                    SET stripe_account_id = NULL,
                        stripe_publishable_key = NULL,
                        stripe_connected = FALSE,
                        stripe_connected_at = NULL,
                        updated_at = NOW()
                    WHERE organization_id = $1
                `, [req.organizationId]);
                return result.rows[0]?.stripe_account_id || null;
            });
            await stripeConnectService.deauthorizeAccount(current);
            res.json({ success: true });
        } catch (error) {
            logger.error('Stripe Connect disconnect failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return sendError(res, 'Failed to disconnect Stripe');
        }
    });

    return router;
};
