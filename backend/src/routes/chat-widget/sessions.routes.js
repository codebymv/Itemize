const express = require('express');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { chatMessageColumns, chatSessionColumns } = require('./columns');

module.exports = (pool, authenticateJWT, requireOrganization, io) => {
    const router = express.Router();

    /**
     * GET /api/chat-widget/sessions - List active chat sessions
     */
    router.get('/sessions', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status = 'active', page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const data = await withDbClient(pool, async (client) => {
                let whereClause = 'WHERE cs.organization_id = $1';
                const params = [req.organizationId];
                let paramIndex = 2;

                if (status && status !== 'all') {
                    whereClause += ` AND cs.status = $${paramIndex}`;
                    params.push(status);
                    paramIndex++;
                }

                const countResult = await client.query(
                    `SELECT COUNT(*) FROM chat_sessions cs ${whereClause}`,
                    params
                );

                const result = await client.query(`
                SELECT ${chatSessionColumns('cs')},
                    cw.name as widget_name,
                    (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id AND is_read = FALSE AND sender_type = 'visitor') as unread_count,
                    (SELECT content FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message
                FROM chat_sessions cs
                LEFT JOIN chat_widgets cw ON cs.widget_id = cw.id
                ${whereClause}
                ORDER BY cs.last_seen_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);
                return { countResult, result };
            });

            res.json({
                sessions: data.result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(data.countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(data.countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching chat sessions:', error);
            return sendError(res, 'Failed to fetch chat sessions');
        }
    });

    /**
     * GET /api/chat-widget/sessions/:id - Get session with messages
     */
    router.get('/sessions/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const sessionResult = await client.query(`
                SELECT ${chatSessionColumns('cs')}, cw.name as widget_name
                FROM chat_sessions cs
                LEFT JOIN chat_widgets cw ON cs.widget_id = cw.id
                WHERE cs.id = $1 AND cs.organization_id = $2
            `, [id, req.organizationId]);
                if (sessionResult.rows.length === 0) {
                    return { session: null, messages: [] };
                }

                const messagesResult = await client.query(`
                SELECT ${chatMessageColumns('cm')}, u.name as agent_name
                FROM chat_messages cm
                LEFT JOIN users u ON cm.sender_user_id = u.id
                WHERE cm.session_id = $1
                ORDER BY cm.created_at ASC
            `, [id]);
                return { session: sessionResult.rows[0], messages: messagesResult.rows };
            });

            if (!data.session) {
                return res.status(404).json({ error: 'Session not found' });
            }

            data.session.messages = data.messages;
            res.json(data.session);
        } catch (error) {
            console.error('Error fetching chat session:', error);
            return sendError(res, 'Failed to fetch chat session');
        }
    });

    /**
     * POST /api/chat-widget/sessions/:id/messages - Send message as agent
     */
    router.post('/sessions/:id/messages', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { content } = req.body;

            if (!content || content.trim().length === 0) {
                return res.status(400).json({ error: 'Message content is required' });
            }

            const data = await withDbClient(pool, async (client) => {
                // Verify session
                const sessionCheck = await client.query(
                    'SELECT id, session_token FROM chat_sessions WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (sessionCheck.rows.length === 0) {
                    return { session: null, message: null };
                }

                // Insert message
                const messageResult = await client.query(`
                INSERT INTO chat_messages (session_id, organization_id, sender_type, sender_user_id, content)
                VALUES ($1, $2, 'agent', $3, $4)
                RETURNING ${chatMessageColumns()}
            `, [id, req.organizationId, req.user.id, content.trim()]);

            // Update session last_seen
            await client.query(`
                UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [id]);

            // Update widget stats
            await client.query(`
                UPDATE chat_widgets SET
                    total_messages = total_messages + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = $1
            `, [req.organizationId]);

            // Get message with agent info
                const fullMessage = await client.query(`
                SELECT ${chatMessageColumns('cm')}, u.name as agent_name
                FROM chat_messages cm
                LEFT JOIN users u ON cm.sender_user_id = u.id
                WHERE cm.id = $1
            `, [messageResult.rows[0].id]);
                return { session: sessionCheck.rows[0], message: fullMessage.rows[0] };
            });

            if (!data.session) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Broadcast to visitor via WebSocket
            if (io) {
                const sessionToken = data.session.session_token;
                io.to(`chat-session-${sessionToken}`).emit('newChatMessage', {
                    message: data.message,
                    timestamp: new Date().toISOString()
                });
            }

            res.status(201).json(data.message);
        } catch (error) {
            console.error('Error sending agent message:', error);
            return sendError(res, 'Failed to send message');
        }
    });

    /**
     * POST /api/chat-widget/sessions/:id/convert - Convert session to contact
     */
    router.post('/sessions/:id/convert', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withTransaction(pool, async (client) => {
                // Get session
                const sessionResult = await client.query(
                    `SELECT ${chatSessionColumns()} FROM chat_sessions WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (sessionResult.rows.length === 0) {
                    return { error: 'Session not found', status: 404, data: null };
                }

                const session = sessionResult.rows[0];

                if (session.contact_id) {
                    return { error: 'Session already converted to contact', status: 400, data: null };
                }

                // Create contact
                const contactResult = await client.query(`
                    INSERT INTO contacts (
                        organization_id, first_name, last_name, email, phone, source, status
                    ) VALUES ($1, $2, $3, $4, $5, 'chat_widget', 'lead')
                    RETURNING id
                `, [
                    req.organizationId,
                    session.visitor_name?.split(' ')[0] || 'Chat',
                    session.visitor_name?.split(' ').slice(1).join(' ') || 'Visitor',
                    session.visitor_email,
                    session.visitor_phone
                ]);

                const contactId = contactResult.rows[0].id;

                // Create conversation linked to contact
                const conversationResult = await client.query(`
                    INSERT INTO conversations (
                        organization_id, contact_id, channel, subject, assigned_to
                    ) VALUES ($1, $2, 'chat', 'Chat Widget Conversation', $3)
                    RETURNING id
                `, [req.organizationId, contactId, req.user.id]);

                // Update session
                await client.query(`
                    UPDATE chat_sessions SET
                        contact_id = $1,
                        conversation_id = $2,
                        status = 'converted',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [contactId, conversationResult.rows[0].id, id]);

                // Copy chat messages to conversation messages
                await client.query(`
                    INSERT INTO messages (conversation_id, organization_id, sender_type, sender_user_id, sender_contact_id, channel, content, created_at)
                    SELECT $1, $2,
                        CASE WHEN cm.sender_type = 'visitor' THEN 'contact' ELSE 'user' END,
                        cm.sender_user_id,
                        CASE WHEN cm.sender_type = 'visitor' THEN $3 ELSE NULL END,
                        'chat',
                        cm.content,
                        cm.created_at
                    FROM chat_messages cm
                    WHERE cm.session_id = $4
                    ORDER BY cm.created_at
                `, [conversationResult.rows[0].id, req.organizationId, contactId, id]);
                return {
                    error: null,
                    status: 200,
                    data: {
                        success: true,
                        contact_id: contactId,
                        conversation_id: conversationResult.rows[0].id
                    }
                };
            });

            if (result.error) {
                return res.status(result.status).json({ error: result.error });
            }

            return res.json(result.data);
        } catch (error) {
            console.error('Error converting chat session:', error);
            return sendError(res, 'Failed to convert session');
        }
    });

    return router;
};
