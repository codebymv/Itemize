const express = require('express');
const { withDbClient } = require('../../utils/db');
const { socialChannelColumns, socialConversationColumns, socialMessageColumns } = require('./columns');

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

module.exports = (pool, io) => {
    const router = express.Router();

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
        try {
            const data = await withDbClient(pool, async (client) => {
                // Find the channel
                const channelResult = await client.query(`
                    SELECT ${socialChannelColumns()} FROM social_channels
                    WHERE page_id = $1 AND channel_type = $2 AND is_connected = TRUE
                `, [pageId, channelType === 'instagram' ? 'instagram' : 'facebook']);

                if (channelResult.rows.length === 0) {
                    console.log('No connected channel found for page:', pageId);
                    return { status: 'skip' };
                }

                const channel = channelResult.rows[0];

                // Get or create conversation
                let conversationResult = await client.query(`
                    SELECT ${socialConversationColumns()} FROM social_conversations
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
                    } catch (_error) {
                        console.log('Could not fetch sender profile');
                    }

                    // Create conversation
                    const newConvResult = await client.query(`
                        INSERT INTO social_conversations (
                            organization_id, channel_id, participant_id, participant_name,
                            participant_username, participant_profile_pic, status, unread_count
                        ) VALUES ($1, $2, $3, $4, $5, $6, 'open', 1)
                        RETURNING ${socialConversationColumns()}
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
                    RETURNING ${socialMessageColumns()}
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

                return {
                    status: 'ok',
                    channel,
                    conversationId,
                    isNewConversation: conversationResult.rows.length === 0,
                    message: messageResult.rows[0]
                };
            });

            if (data.status === 'skip') {
                return;
            }

            // Emit via WebSocket
            if (io) {
                io.to(`org_${data.channel.organization_id}`).emit('social_message', {
                    conversation_id: data.conversationId,
                    message: data.message,
                    is_new_conversation: data.isNewConversation
                });
            }
        } catch (error) {
            console.error('Error handling messaging event:', error);
        }
    }

    return router;
};
