const express = require('express');
const crypto = require('crypto');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    // OAuth & Connection
    // ======================

    /**
     * GET /api/social/connect/facebook - Get Facebook OAuth URL
     */
    router.get('/connect/facebook', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const appId = process.env.FACEBOOK_APP_ID;
            const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/social/callback/facebook`;

            if (!appId) {
                return res.status(400).json({ error: 'Facebook app not configured' });
            }

            // Store state for validation
            const state = crypto.randomBytes(32).toString('hex');

            // Store state temporarily (in production, use Redis or similar)
            await withDbClient(pool, async (client) => client.query(`
                INSERT INTO oauth_states (state, organization_id, user_id, provider, expires_at)
                VALUES ($1, $2, $3, 'facebook', NOW() + INTERVAL '10 minutes')
                ON CONFLICT (state) DO UPDATE SET
                    organization_id = EXCLUDED.organization_id,
                    user_id = EXCLUDED.user_id,
                    expires_at = EXCLUDED.expires_at
            `, [state, req.organizationId, req.user.id]));

            const scopes = [
                'pages_show_list',
                'pages_messaging',
                'pages_manage_metadata',
                'pages_read_engagement',
                'instagram_basic',
                'instagram_manage_messages',
                'business_management'
            ].join(',');

            const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}`;

            res.json({ auth_url: authUrl });
        } catch (error) {
            console.error('Error generating Facebook OAuth URL:', error);
            return sendError(res, 'Failed to generate OAuth URL');
        }
    });

    /**
     * GET /api/social/callback/facebook - Facebook OAuth callback
     */
    router.get('/callback/facebook', async (req, res) => {
        try {
            const { code, state, error, error_description } = req.query;

            if (error) {
                console.error('Facebook OAuth error:', error, error_description);
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=${encodeURIComponent(error_description || error)}`);
            }

            if (!code || !state) {
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=missing_params`);
            }

            const stateData = await withDbClient(pool, async (client) => {
                // Validate state
                const stateResult = await client.query(`
                    SELECT organization_id, user_id FROM oauth_states
                    WHERE state = $1 AND provider = 'facebook' AND expires_at > NOW()
                `, [state]);

                if (stateResult.rows.length === 0) {
                    return { error: 'invalid_state' };
                }

                const { organization_id, user_id } = stateResult.rows[0];

                // Delete used state
                await client.query('DELETE FROM oauth_states WHERE state = $1', [state]);

                return { organization_id, user_id };
            });

            if (stateData.error) {
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
            }

            const { organization_id, user_id } = stateData;

            // Exchange code for token
            const appId = process.env.FACEBOOK_APP_ID;
            const appSecret = process.env.FACEBOOK_APP_SECRET;
            const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/social/callback/facebook`;

            const tokenResponse = await fetch(`${FB_GRAPH_API}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                console.error('Facebook token error:', tokenData.error);
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`);
            }

            const userAccessToken = tokenData.access_token;

            // Get user's pages
            const pagesResponse = await fetch(`${FB_GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userAccessToken}`);
            const pagesData = await pagesResponse.json();

            if (pagesData.error) {
                console.error('Facebook pages error:', pagesData.error);
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=pages_fetch_failed`);
            }

            // Get user ID for token refresh
            const meResponse = await fetch(`${FB_GRAPH_API}/me?access_token=${userAccessToken}`);
            const meData = await meResponse.json();

            await withDbClient(pool, async (client) => {
                const pages = pagesData.data || [];
                if (pages.length === 0) return;

                // Collect Facebook data
                const fbData = pages.map(page => [
                    organization_id,
                    'facebook',
                    page.id,
                    page.name,
                    page.name,
                    page.id,
                    page.access_token,
                    meData.id,
                    userAccessToken,
                    true,
                    user_id
                ]);

                // Collect Instagram data
                const igData = pages
                    .filter(page => page.instagram_business_account)
                    .map(page => {
                        const ig = page.instagram_business_account;
                        return [
                            organization_id,
                            'instagram',
                            ig.id,
                            ig.username || 'Instagram',
                            ig.username,
                            ig.profile_picture_url,
                            ig.id,
                            page.id,
                            page.access_token,
                            meData.id,
                            userAccessToken,
                            true,
                            user_id
                        ];
                    });

                if (fbData.length > 0) {
                    await client.query(`
                        INSERT INTO social_channels (
                            organization_id, channel_type, external_id, name, username,
                            page_id, page_access_token, user_id, user_access_token,
                            is_connected, created_by
                        )
                        SELECT
                            organization_id,
                            channel_type,
                            external_id,
                            name,
                            username,
                            page_id,
                            page_access_token,
                            user_id,
                            user_access_token,
                            is_connected,
                            created_by
                        FROM UNNEST(
                            $1::int[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
                            $6::varchar[], $7::text[], $8::varchar[], $9::text[], $10::boolean[], $11::int[]
                        ) AS channels(
                            organization_id,
                            channel_type,
                            external_id,
                            name,
                            username,
                            page_id,
                            page_access_token,
                            user_id,
                            user_access_token,
                            is_connected,
                            created_by
                        )
                        ON CONFLICT (organization_id, channel_type, external_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            page_access_token = EXCLUDED.page_access_token,
                            user_access_token = EXCLUDED.user_access_token,
                            is_connected = TRUE,
                            connection_error = NULL,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        fbData.map(d => d[0]),
                        fbData.map(d => d[1]),
                        fbData.map(d => d[2]),
                        fbData.map(d => d[3]),
                        fbData.map(d => d[4]),
                        fbData.map(d => d[5]),
                        fbData.map(d => d[6]),
                        fbData.map(d => d[7]),
                        fbData.map(d => d[8]),
                        fbData.map(d => d[9]),
                        fbData.map(d => d[10])
                    ]);
                }

                if (igData.length > 0) {
                    await client.query(`
                        INSERT INTO social_channels (
                            organization_id, channel_type, external_id, name, username,
                            profile_picture_url, instagram_business_account_id,
                            page_id, page_access_token, user_id, user_access_token,
                            is_connected, created_by
                        )
                        SELECT
                            organization_id,
                            channel_type,
                            external_id,
                            name,
                            username,
                            profile_picture_url,
                            instagram_business_account_id,
                            page_id,
                            page_access_token,
                            user_id,
                            user_access_token,
                            is_connected,
                            created_by
                        FROM UNNEST(
                            $1::int[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
                            $6::text[], $7::varchar[], $8::varchar[], $9::text[], $10::varchar[],
                            $11::text[], $12::boolean[], $13::int[]
                        ) AS channels(
                            organization_id,
                            channel_type,
                            external_id,
                            name,
                            username,
                            profile_picture_url,
                            instagram_business_account_id,
                            page_id,
                            page_access_token,
                            user_id,
                            user_access_token,
                            is_connected,
                            created_by
                        )
                        ON CONFLICT (organization_id, channel_type, external_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            username = EXCLUDED.username,
                            profile_picture_url = EXCLUDED.profile_picture_url,
                            page_access_token = EXCLUDED.page_access_token,
                            user_access_token = EXCLUDED.user_access_token,
                            is_connected = TRUE,
                            connection_error = NULL,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        igData.map(d => d[0]),
                        igData.map(d => d[1]),
                        igData.map(d => d[2]),
                        igData.map(d => d[3]),
                        igData.map(d => d[4]),
                        igData.map(d => d[5]),
                        igData.map(d => d[6]),
                        igData.map(d => d[7]),
                        igData.map(d => d[8]),
                        igData.map(d => d[9]),
                        igData.map(d => d[10]),
                        igData.map(d => d[11]),
                        igData.map(d => d[12])
                    ]);
                }
            });

            res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=facebook_connected`);
        } catch (error) {
            console.error('Error in Facebook callback:', error);
            res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=callback_failed`);
        }
    });

    // ======================

    return router;
};
