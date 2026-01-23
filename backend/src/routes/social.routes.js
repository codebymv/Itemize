/**
 * Social Media Integration Routes
 * Facebook/Instagram messaging and connection management
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Facebook Graph API base URL
const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

module.exports = (pool, authenticateJWT, publicRateLimit, io) => {

    /**
     * Middleware to require organization context
     */
    const requireOrganization = async (req, res, next) => {
        try {
            const organizationId = req.query.organization_id || req.body.organization_id || req.headers['x-organization-id'];

            if (!organizationId) {
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT default_organization_id FROM users WHERE id = $1',
                    [req.user.id]
                );
                client.release();

                if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
                    return res.status(400).json({ error: 'Organization ID required' });
                }
                req.organizationId = result.rows[0].default_organization_id;
            } else {
                req.organizationId = parseInt(organizationId);
            }

            const client = await pool.connect();
            const memberCheck = await client.query(
                'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
                [req.organizationId, req.user.id]
            );
            client.release();

            if (memberCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Not a member of this organization' });
            }

            req.orgRole = memberCheck.rows[0].role;
            next();
        } catch (error) {
            console.error('Error in requireOrganization middleware:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    // ======================
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
            const client = await pool.connect();
            await client.query(`
                INSERT INTO oauth_states (state, organization_id, user_id, provider, expires_at)
                VALUES ($1, $2, $3, 'facebook', NOW() + INTERVAL '10 minutes')
                ON CONFLICT (state) DO UPDATE SET 
                    organization_id = EXCLUDED.organization_id,
                    user_id = EXCLUDED.user_id,
                    expires_at = EXCLUDED.expires_at
            `, [state, req.organizationId, req.user.id]);
            client.release();

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
            res.status(500).json({ error: 'Failed to generate OAuth URL' });
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

            const client = await pool.connect();

            // Validate state
            const stateResult = await client.query(`
                SELECT organization_id, user_id FROM oauth_states 
                WHERE state = $1 AND provider = 'facebook' AND expires_at > NOW()
            `, [state]);

            if (stateResult.rows.length === 0) {
                client.release();
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
            }

            const { organization_id, user_id } = stateResult.rows[0];

            // Delete used state
            await client.query('DELETE FROM oauth_states WHERE state = $1', [state]);

            // Exchange code for token
            const appId = process.env.FACEBOOK_APP_ID;
            const appSecret = process.env.FACEBOOK_APP_SECRET;
            const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/social/callback/facebook`;

            const tokenResponse = await fetch(`${FB_GRAPH_API}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                client.release();
                console.error('Facebook token error:', tokenData.error);
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`);
            }

            const userAccessToken = tokenData.access_token;

            // Get user's pages
            const pagesResponse = await fetch(`${FB_GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userAccessToken}`);
            const pagesData = await pagesResponse.json();

            if (pagesData.error) {
                client.release();
                console.error('Facebook pages error:', pagesData.error);
                return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=pages_fetch_failed`);
            }

            // Get user ID for token refresh
            const meResponse = await fetch(`${FB_GRAPH_API}/me?access_token=${userAccessToken}`);
            const meData = await meResponse.json();

            // Store each page as a channel
            for (const page of pagesData.data || []) {
                // Store Facebook Page
                await client.query(`
                    INSERT INTO social_channels (
                        organization_id, channel_type, external_id, name, username,
                        page_id, page_access_token, user_id, user_access_token,
                        is_connected, created_by
                    ) VALUES ($1, 'facebook', $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
                    ON CONFLICT (organization_id, channel_type, external_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        page_access_token = EXCLUDED.page_access_token,
                        user_access_token = EXCLUDED.user_access_token,
                        is_connected = TRUE,
                        connection_error = NULL,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    organization_id,
                    page.id,
                    page.name,
                    page.name,
                    page.id,
                    page.access_token,
                    meData.id,
                    userAccessToken,
                    user_id
                ]);

                // Store Instagram if connected
                if (page.instagram_business_account) {
                    const ig = page.instagram_business_account;
                    await client.query(`
                        INSERT INTO social_channels (
                            organization_id, channel_type, external_id, name, username,
                            profile_picture_url, instagram_business_account_id,
                            page_id, page_access_token, user_id, user_access_token,
                            is_connected, created_by
                        ) VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)
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
                        organization_id,
                        ig.id,
                        ig.username || 'Instagram',
                        ig.username,
                        ig.profile_picture_url,
                        ig.id,
                        page.id,
                        page.access_token,
                        meData.id,
                        userAccessToken,
                        user_id
                    ]);
                }
            }

            client.release();
            res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=facebook_connected`);
        } catch (error) {
            console.error('Error in Facebook callback:', error);
            res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=callback_failed`);
        }
    });

    // ======================
    // Channel Management
    // ======================

    /**
     * GET /api/social/channels - List connected channels
     */
    router.get('/channels', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { channel_type } = req.query;
            const client = await pool.connect();

            let query = `
                SELECT sc.*, u.name as created_by_name
                FROM social_channels sc
                LEFT JOIN users u ON sc.created_by = u.id
                WHERE sc.organization_id = $1
            `;
            const params = [req.organizationId];

            if (channel_type) {
                query += ' AND sc.channel_type = $2';
                params.push(channel_type);
            }

            query += ' ORDER BY sc.channel_type, sc.name';

            const result = await client.query(query, params);
            client.release();

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching channels:', error);
            res.status(500).json({ error: 'Failed to fetch channels' });
        }
    });

    /**
     * DELETE /api/social/channels/:id - Disconnect channel
     */
    router.delete('/channels/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                UPDATE social_channels SET
                    is_connected = FALSE,
                    page_access_token = NULL,
                    user_access_token = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2
                RETURNING id
            `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error disconnecting channel:', error);
            res.status(500).json({ error: 'Failed to disconnect channel' });
        }
    });

    // ======================
    // Conversations
    // ======================

    /**
     * GET /api/social/conversations - List conversations
     */
    router.get('/conversations', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { channel_id, channel_type, status, assigned_to, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE sc.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (channel_id) {
                whereClause += ` AND sc.channel_id = $${paramIndex}`;
                params.push(parseInt(channel_id));
                paramIndex++;
            }

            if (channel_type) {
                whereClause += ` AND ch.channel_type = $${paramIndex}`;
                params.push(channel_type);
                paramIndex++;
            }

            if (status && status !== 'all') {
                whereClause += ` AND sc.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (assigned_to) {
                whereClause += ` AND sc.assigned_to = $${paramIndex}`;
                params.push(parseInt(assigned_to));
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(`
                SELECT COUNT(*) FROM social_conversations sc
                JOIN social_channels ch ON sc.channel_id = ch.id
                ${whereClause}
            `, params);

            const result = await client.query(`
                SELECT sc.*, 
                       ch.channel_type, ch.name as channel_name,
                       c.first_name as contact_first_name, c.last_name as contact_last_name,
                       u.name as assigned_to_name
                FROM social_conversations sc
                JOIN social_channels ch ON sc.channel_id = ch.id
                LEFT JOIN contacts c ON sc.contact_id = c.id
                LEFT JOIN users u ON sc.assigned_to = u.id
                ${whereClause}
                ORDER BY sc.last_message_at DESC NULLS LAST
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                conversations: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching conversations:', error);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        }
    });

    /**
     * GET /api/social/conversations/:id - Get conversation with messages
     */
    router.get('/conversations/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const convResult = await client.query(`
                SELECT sc.*, 
                       ch.channel_type, ch.name as channel_name, ch.page_access_token,
                       c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                FROM social_conversations sc
                JOIN social_channels ch ON sc.channel_id = ch.id
                LEFT JOIN contacts c ON sc.contact_id = c.id
                WHERE sc.id = $1 AND sc.organization_id = $2
            `, [id, req.organizationId]);

            if (convResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Conversation not found' });
            }

            const conversation = convResult.rows[0];

            // Get messages
            const messagesResult = await client.query(`
                SELECT sm.*, u.name as sent_by_name
                FROM social_messages sm
                LEFT JOIN users u ON sm.sent_by = u.id
                WHERE sm.conversation_id = $1
                ORDER BY sm.message_timestamp ASC
            `, [id]);

            // Mark as read
            await client.query(`
                UPDATE social_conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [id]);

            client.release();

            // Remove sensitive token from response
            delete conversation.page_access_token;
            conversation.messages = messagesResult.rows;

            res.json(conversation);
        } catch (error) {
            console.error('Error fetching conversation:', error);
            res.status(500).json({ error: 'Failed to fetch conversation' });
        }
    });

    /**
     * PUT /api/social/conversations/:id - Update conversation
     */
    router.put('/conversations/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, assigned_to, contact_id, tags } = req.body;

            const client = await pool.connect();

            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (status) {
                updates.push(`status = $${paramIndex++}`);
                params.push(status);
            }

            if (assigned_to !== undefined) {
                updates.push(`assigned_to = $${paramIndex++}`);
                params.push(assigned_to);
            }

            if (contact_id !== undefined) {
                updates.push(`contact_id = $${paramIndex++}`);
                params.push(contact_id);
            }

            if (tags !== undefined) {
                updates.push(`tags = $${paramIndex++}`);
                params.push(tags);
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id, req.organizationId);

            const result = await client.query(`
                UPDATE social_conversations SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating conversation:', error);
            res.status(500).json({ error: 'Failed to update conversation' });
        }
    });

    // ======================
    // Messaging
    // ======================

    /**
     * POST /api/social/conversations/:id/messages - Send message
     */
    router.post('/conversations/:id/messages', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { text } = req.body;

            if (!text || !text.trim()) {
                return res.status(400).json({ error: 'Message text is required' });
            }

            const client = await pool.connect();

            // Get conversation and channel
            const convResult = await client.query(`
                SELECT sc.*, ch.channel_type, ch.page_access_token, ch.page_id
                FROM social_conversations sc
                JOIN social_channels ch ON sc.channel_id = ch.id
                WHERE sc.id = $1 AND sc.organization_id = $2
            `, [id, req.organizationId]);

            if (convResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Conversation not found' });
            }

            const conversation = convResult.rows[0];

            // Send via Facebook/Instagram API
            let externalMessageId = null;
            let messageStatus = 'pending';
            let errorMessage = null;

            if (conversation.page_access_token) {
                try {
                    const apiUrl = conversation.channel_type === 'instagram'
                        ? `${FB_GRAPH_API}/${conversation.page_id}/messages`
                        : `${FB_GRAPH_API}/${conversation.page_id}/messages`;

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: conversation.participant_id },
                            message: { text: text.trim() },
                            messaging_type: 'RESPONSE',
                            access_token: conversation.page_access_token
                        })
                    });

                    const responseData = await response.json();

                    if (responseData.message_id) {
                        externalMessageId = responseData.message_id;
                        messageStatus = 'sent';
                    } else if (responseData.error) {
                        errorMessage = responseData.error.message;
                        messageStatus = 'failed';
                    }
                } catch (apiError) {
                    console.error('Error sending to Facebook API:', apiError);
                    errorMessage = apiError.message;
                    messageStatus = 'failed';
                }
            } else {
                // No token - store as pending (for demo/testing)
                messageStatus = 'pending';
            }

            // Store message
            const messageResult = await client.query(`
                INSERT INTO social_messages (
                    organization_id, conversation_id, channel_id, external_message_id,
                    message_type, text_content, direction, sent_by, status, error_message
                ) VALUES ($1, $2, $3, $4, 'text', $5, 'outbound', $6, $7, $8)
                RETURNING *
            `, [
                req.organizationId,
                id,
                conversation.channel_id,
                externalMessageId,
                text.trim(),
                req.user.id,
                messageStatus,
                errorMessage
            ]);

            // Update conversation
            await client.query(`
                UPDATE social_conversations SET
                    last_message_text = $1,
                    last_message_at = CURRENT_TIMESTAMP,
                    last_message_from = 'agent',
                    message_count = message_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [text.trim().substring(0, 100), id]);

            client.release();

            const message = messageResult.rows[0];

            // Emit via WebSocket
            if (io) {
                io.to(`org_${req.organizationId}`).emit('social_message', {
                    conversation_id: parseInt(id),
                    message
                });
            }

            res.status(201).json(message);
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    // ======================
    // Webhook (for receiving messages)
    // ======================

    /**
     * GET /api/social/webhook - Webhook verification
     */
    router.get('/webhook', (req, res) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                console.log('Webhook verified');
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        } else {
            res.sendStatus(400);
        }
    });

    /**
     * POST /api/social/webhook - Receive webhook events
     */
    router.post('/webhook', express.json(), async (req, res) => {
        try {
            const body = req.body;

            if (body.object === 'page' || body.object === 'instagram') {
                for (const entry of body.entry || []) {
                    const pageId = entry.id;

                    // Handle messaging events
                    for (const messagingEvent of entry.messaging || []) {
                        await handleMessagingEvent(pool, io, pageId, messagingEvent, body.object);
                    }

                    // Handle Instagram messaging
                    for (const messagingEvent of entry.messaging || []) {
                        await handleMessagingEvent(pool, io, pageId, messagingEvent, 'instagram');
                    }
                }

                res.status(200).send('EVENT_RECEIVED');
            } else {
                res.sendStatus(404);
            }
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.sendStatus(500);
        }
    });

    /**
     * Handle incoming messaging event
     */
    async function handleMessagingEvent(pool, io, pageId, event, channelType) {
        const senderId = event.sender?.id;
        const message = event.message;

        if (!senderId || !message) return;

        const client = await pool.connect();

        try {
            // Find the channel
            const channelResult = await client.query(`
                SELECT * FROM social_channels 
                WHERE page_id = $1 AND channel_type = $2 AND is_connected = TRUE
            `, [pageId, channelType === 'instagram' ? 'instagram' : 'facebook']);

            if (channelResult.rows.length === 0) {
                console.log('No connected channel found for page:', pageId);
                client.release();
                return;
            }

            const channel = channelResult.rows[0];

            // Get or create conversation
            let conversationResult = await client.query(`
                SELECT * FROM social_conversations
                WHERE channel_id = $1 AND participant_id = $2
            `, [channel.id, senderId]);

            let conversationId;

            if (conversationResult.rows.length === 0) {
                // Get sender info from Facebook
                let senderName = 'Unknown';
                let senderUsername = null;
                let senderProfilePic = null;

                try {
                    const profileResponse = await fetch(`${FB_GRAPH_API}/${senderId}?fields=name,profile_pic&access_token=${channel.page_access_token}`);
                    const profileData = await profileResponse.json();
                    if (profileData.name) senderName = profileData.name;
                    if (profileData.profile_pic) senderProfilePic = profileData.profile_pic;
                } catch (e) {
                    console.log('Could not fetch sender profile');
                }

                // Create conversation
                const newConvResult = await client.query(`
                    INSERT INTO social_conversations (
                        organization_id, channel_id, participant_id, participant_name,
                        participant_username, participant_profile_pic, status, unread_count
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'open', 1)
                    RETURNING *
                `, [
                    channel.organization_id,
                    channel.id,
                    senderId,
                    senderName,
                    senderUsername,
                    senderProfilePic
                ]);

                conversationId = newConvResult.rows[0].id;
            } else {
                conversationId = conversationResult.rows[0].id;

                // Update unread count
                await client.query(`
                    UPDATE social_conversations SET
                        unread_count = unread_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [conversationId]);
            }

            // Determine message type
            let messageType = 'text';
            let textContent = message.text || null;
            let mediaUrl = null;
            let mediaType = null;

            if (message.attachments && message.attachments.length > 0) {
                const attachment = message.attachments[0];
                messageType = attachment.type || 'file';
                mediaUrl = attachment.payload?.url;
                mediaType = attachment.type;
            }

            if (message.sticker_id) {
                messageType = 'sticker';
            }

            // Store message
            const messageResult = await client.query(`
                INSERT INTO social_messages (
                    organization_id, conversation_id, channel_id, external_message_id,
                    message_type, text_content, media_url, media_type,
                    direction, sender_id, sender_name, status, message_timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'inbound', $9, $10, 'delivered', $11)
                RETURNING *
            `, [
                channel.organization_id,
                conversationId,
                channel.id,
                message.mid,
                messageType,
                textContent,
                mediaUrl,
                mediaType,
                senderId,
                conversationResult.rows[0]?.participant_name || 'Unknown',
                new Date(event.timestamp)
            ]);

            // Update conversation last message
            await client.query(`
                UPDATE social_conversations SET
                    last_message_text = $1,
                    last_message_at = $2,
                    last_message_from = 'contact',
                    message_count = message_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [
                (textContent || `[${messageType}]`).substring(0, 100),
                new Date(event.timestamp),
                conversationId
            ]);

            client.release();

            // Emit via WebSocket
            if (io) {
                io.to(`org_${channel.organization_id}`).emit('social_message', {
                    conversation_id: conversationId,
                    message: messageResult.rows[0],
                    is_new_conversation: conversationResult.rows.length === 0
                });
            }
        } catch (error) {
            client.release();
            console.error('Error handling messaging event:', error);
        }
    }

    // ======================
    // Analytics
    // ======================

    /**
     * GET /api/social/analytics - Get social messaging analytics
     */
    router.get('/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30' } = req.query;
            const days = parseInt(period);

            const client = await pool.connect();

            // Channel stats
            const channelStats = await client.query(`
                SELECT 
                    ch.channel_type,
                    COUNT(DISTINCT sc.id) as conversation_count,
                    COUNT(sm.id) as message_count,
                    COUNT(sm.id) FILTER (WHERE sm.direction = 'inbound') as inbound_count,
                    COUNT(sm.id) FILTER (WHERE sm.direction = 'outbound') as outbound_count
                FROM social_channels ch
                LEFT JOIN social_conversations sc ON ch.id = sc.channel_id
                LEFT JOIN social_messages sm ON sc.id = sm.conversation_id 
                    AND sm.created_at >= NOW() - INTERVAL '${days} days'
                WHERE ch.organization_id = $1 AND ch.is_connected = TRUE
                GROUP BY ch.channel_type
            `, [req.organizationId]);

            // Response time
            const responseStats = await client.query(`
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (outbound.message_timestamp - inbound.message_timestamp)) / 60) as avg_response_minutes
                FROM social_messages inbound
                JOIN social_messages outbound ON inbound.conversation_id = outbound.conversation_id
                WHERE inbound.organization_id = $1
                    AND inbound.direction = 'inbound'
                    AND outbound.direction = 'outbound'
                    AND outbound.message_timestamp > inbound.message_timestamp
                    AND inbound.created_at >= NOW() - INTERVAL '${days} days'
            `, [req.organizationId]);

            // Messages over time
            const messagesOverTime = await client.query(`
                SELECT 
                    DATE_TRUNC('day', message_timestamp) as date,
                    COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
                    COUNT(*) FILTER (WHERE direction = 'outbound') as outbound
                FROM social_messages
                WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE_TRUNC('day', message_timestamp)
                ORDER BY date
            `, [req.organizationId]);

            // Conversation status distribution
            const statusDist = await client.query(`
                SELECT status, COUNT(*) as count
                FROM social_conversations
                WHERE organization_id = $1
                GROUP BY status
            `, [req.organizationId]);

            client.release();

            res.json({
                period: days,
                channels: channelStats.rows,
                avg_response_time_minutes: responseStats.rows[0]?.avg_response_minutes || null,
                messages_over_time: messagesOverTime.rows,
                status_distribution: statusDist.rows
            });
        } catch (error) {
            console.error('Error fetching social analytics:', error);
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    return router;
};
