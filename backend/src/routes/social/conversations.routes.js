const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { socialConversationColumns, socialMessageColumns } = require('./columns');

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

module.exports = (pool, authenticateJWT, requireOrganization, io) => {
    const router = express.Router();

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

            const { countResult, result } = await withDbClient(pool, async (client) => {
                const countResult = await client.query(`
                    SELECT COUNT(*) FROM social_conversations sc
                    JOIN social_channels ch ON sc.channel_id = ch.id
                    ${whereClause}
                `, params);

                const result = await client.query(`
                    SELECT ${socialConversationColumns('sc')},
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

                return { countResult, result };
            });

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
            return sendError(res, 'Failed to fetch conversations');
        }
    });

    /**
     * GET /api/social/conversations/:id - Get conversation with messages
     */
    router.get('/conversations/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const convResult = await client.query(`
                    SELECT ${socialConversationColumns('sc')},
                           ch.channel_type, ch.name as channel_name, ch.page_access_token,
                           c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                    FROM social_conversations sc
                    JOIN social_channels ch ON sc.channel_id = ch.id
                    LEFT JOIN contacts c ON sc.contact_id = c.id
                    WHERE sc.id = $1 AND sc.organization_id = $2
                `, [id, req.organizationId]);

                if (convResult.rows.length === 0) {
                    return { status: 404, error: 'Conversation not found' };
                }

                const conversation = convResult.rows[0];

                // Get messages
                const messagesResult = await client.query(`
                    SELECT ${socialMessageColumns('sm')}, u.name as sent_by_name
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

                return { status: 200, conversation, messagesResult };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            // Remove sensitive token from response
            delete data.conversation.page_access_token;
            data.conversation.messages = data.messagesResult.rows;

            res.json(data.conversation);
        } catch (error) {
            console.error('Error fetching conversation:', error);
            return sendError(res, 'Failed to fetch conversation');
        }
    });

    /**
     * PUT /api/social/conversations/:id - Update conversation
     */
    router.put('/conversations/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, assigned_to, contact_id, tags } = req.body;

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

            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE social_conversations SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING ${socialConversationColumns()}
            `, params));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating conversation:', error);
            return sendError(res, 'Failed to update conversation');
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

            const data = await withDbClient(pool, async (client) => {
                // Get conversation and channel
                const convResult = await client.query(`
                    SELECT ${socialConversationColumns('sc')}, ch.channel_type, ch.page_access_token, ch.page_id
                    FROM social_conversations sc
                    JOIN social_channels ch ON sc.channel_id = ch.id
                    WHERE sc.id = $1 AND sc.organization_id = $2
                `, [id, req.organizationId]);

                if (convResult.rows.length === 0) {
                    return { status: 404, error: 'Conversation not found' };
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
                    RETURNING ${socialMessageColumns()}
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

                return { status: 201, message: messageResult.rows[0] };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            // Emit via WebSocket
            if (io) {
                io.to(`org_${req.organizationId}`).emit('social_message', {
                    conversation_id: parseInt(id),
                    message: data.message
                });
            }

            res.status(201).json(data.message);
        } catch (error) {
            console.error('Error sending message:', error);
            return sendError(res, 'Failed to send message');
        }
    });

    // ======================

    return router;
};
