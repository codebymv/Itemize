const express = require('express');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { generateSessionToken } = require('./helpers');
const { chatMessageColumns } = require('./columns');

module.exports = (pool, publicRateLimit, io, broadcast) => {
    const router = express.Router();


    /**
     * GET /api/chat-widget/public/config/:widgetKey - Get widget config for embedding
     */
    router.get('/public/config/:widgetKey', publicRateLimit, async (req, res) => {
        try {
            const { widgetKey } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
                SELECT
                    widget_key,
                    name,
                    primary_color,
                    text_color,
                    position,
                    icon_style,
                    custom_icon_url,
                    welcome_title,
                    welcome_message,
                    placeholder_text,
                    require_email,
                    require_name,
                    require_phone,
                    custom_fields,
                    is_active,
                    auto_open_delay,
                    show_branding,
                    business_hours,
                    offline_message
                FROM chat_widgets
                WHERE widget_key = $1 AND is_active = TRUE
            `, [widgetKey]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found or inactive' });
            }

            // Check if within business hours
            const widget = result.rows[0];
            let isOnline = true;

            if (widget.business_hours) {
                const now = new Date();
                const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
                const currentTime = now.getHours() * 60 + now.getMinutes();

                const todayHours = widget.business_hours[dayOfWeek];
                if (todayHours && todayHours.start && todayHours.end) {
                    const [startH, startM] = todayHours.start.split(':').map(Number);
                    const [endH, endM] = todayHours.end.split(':').map(Number);
                    const startMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;
                    isOnline = currentTime >= startMinutes && currentTime <= endMinutes;
                } else if (todayHours === null || todayHours.closed) {
                    isOnline = false;
                }
            }

            widget.is_online = isOnline;
            res.json(widget);
        } catch (error) {
            console.error('Error fetching widget config:', error);
            return sendError(res, 'Failed to fetch widget config');
        }
    });

    /**
     * POST /api/chat-widget/public/session - Start a chat session
     */
    router.post('/public/session', publicRateLimit, async (req, res) => {
        try {
            const {
                widget_key,
                visitor_name,
                visitor_email,
                visitor_phone,
                custom_data,
                current_page_url,
                referrer_url
            } = req.body;

            if (!widget_key) {
                return res.status(400).json({ error: 'widget_key is required' });
            }

            const data = await withDbClient(pool, async (client) => {
                // Get widget
                const widgetResult = await client.query(
                    'SELECT id, organization_id, require_email, require_name, require_phone FROM chat_widgets WHERE widget_key = $1 AND is_active = TRUE',
                    [widget_key]
                );

                if (widgetResult.rows.length === 0) {
                    return { error: 'Widget not found or inactive', status: 404, data: null };
                }

                const widget = widgetResult.rows[0];

                // Validate required fields
                if (widget.require_email && !visitor_email) {
                    return { error: 'Email is required', status: 400, data: null };
                }
                if (widget.require_name && !visitor_name) {
                    return { error: 'Name is required', status: 400, data: null };
                }
                if (widget.require_phone && !visitor_phone) {
                    return { error: 'Phone is required', status: 400, data: null };
                }

                // Check for existing session with same email
                if (visitor_email) {
                    const existingSession = await client.query(`
                    SELECT id, session_token FROM chat_sessions
                    WHERE widget_id = $1 AND visitor_email = $2 AND status = 'active'
                    ORDER BY created_at DESC LIMIT 1
                `, [widget.id, visitor_email]);

                    if (existingSession.rows.length > 0) {
                        return {
                            error: null,
                            status: 200,
                            data: {
                                session_token: existingSession.rows[0].session_token,
                                session_id: existingSession.rows[0].id,
                                resumed: true
                            },
                            widget
                        };
                    }
                }

                const sessionToken = generateSessionToken();
                const ipAddress = req.ip || req.connection?.remoteAddress;
                const userAgent = req.headers['user-agent'];

                const sessionResult = await client.query(`
                INSERT INTO chat_sessions (
                    organization_id, widget_id, session_token,
                    visitor_name, visitor_email, visitor_phone, custom_data,
                    ip_address, user_agent, referrer_url, current_page_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, session_token
            `, [
                    widget.organization_id,
                    widget.id,
                    sessionToken,
                    visitor_name || null,
                    visitor_email || null,
                    visitor_phone || null,
                    JSON.stringify(custom_data || {}),
                    ipAddress,
                    userAgent,
                    referrer_url || null,
                    current_page_url || null
                ]);

                // Update widget stats
                await client.query(`
                UPDATE chat_widgets SET
                    total_conversations = total_conversations + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [widget.id]);

                return {
                    error: null,
                    status: 201,
                    data: {
                        session_token: sessionToken,
                        session_id: sessionResult.rows[0].id,
                        resumed: false
                    },
                    widget
                };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            // Notify agents via WebSocket
            if (io) {
                io.to(`org-chat-${data.widget.organization_id}`).emit('newChatSession', {
                    session_id: data.data.session_id,
                    visitor_name,
                    visitor_email,
                    timestamp: new Date().toISOString()
                });
            }
            return res.status(data.status).json(data.data);
        } catch (error) {
            console.error('Error starting chat session:', error);
            return sendError(res, 'Failed to start chat session');
        }
    });

    /**
     * GET /api/chat-widget/public/messages/:sessionToken - Get messages for session
     */
    router.get('/public/messages/:sessionToken', publicRateLimit, async (req, res) => {
        try {
            const { sessionToken } = req.params;
            const { after } = req.query; // For polling new messages

            const data = await withDbClient(pool, async (client) => {
                // Verify session
                const sessionResult = await client.query(
                    'SELECT id, status FROM chat_sessions WHERE session_token = $1',
                    [sessionToken]
                );

                if (sessionResult.rows.length === 0) {
                    return { sessionId: null, messages: [] };
                }

                let query = `
                SELECT ${chatMessageColumns('cm')}, u.name as agent_name
                FROM chat_messages cm
                LEFT JOIN users u ON cm.sender_user_id = u.id
                WHERE cm.session_id = $1
            `;
                const params = [sessionResult.rows[0].id];

                if (after) {
                    query += ' AND cm.created_at > $2';
                    params.push(after);
                }

                query += ' ORDER BY cm.created_at ASC';

                const messagesResult = await client.query(query, params);

                // Update last_seen
                await client.query(`
                UPDATE chat_sessions
                SET last_seen_at = CURRENT_TIMESTAMP, is_online = TRUE
                WHERE id = $1 AND status = 'active'
            `, [sessionResult.rows[0].id]);

                return { sessionId: sessionResult.rows[0].id, messages: messagesResult.rows };
            });

            if (!data.sessionId) {
                return res.status(404).json({ error: 'Session not found' });
            }

            res.json(data.messages);
        } catch (error) {
            console.error('Error fetching messages:', error);
            return sendError(res, 'Failed to fetch messages');
        }
    });

    /**
     * POST /api/chat-widget/public/messages - Send message as visitor
     */
    router.post('/public/messages', publicRateLimit, async (req, res) => {
        try {
            const { session_token, content } = req.body;

            if (!session_token || !content || content.trim().length === 0) {
                return res.status(400).json({ error: 'session_token and content are required' });
            }

            const data = await withTransaction(pool, async (client) => {
                // Get session
                const sessionResult = await client.query(`
                SELECT cs.id, cs.organization_id, cs.widget_id, cs.visitor_name, cs.custom_data
                FROM chat_sessions cs
                WHERE cs.session_token = $1 AND cs.status = 'active'
                FOR UPDATE
            `, [session_token]);

                if (sessionResult.rows.length === 0) {
                    return { session: null, message: null };
                }

                const session = sessionResult.rows[0];

                // Insert message
                const messageResult = await client.query(`
                INSERT INTO chat_messages (session_id, organization_id, sender_type, content)
                VALUES ($1, $2, 'visitor', $3)
                RETURNING ${chatMessageColumns()}
            `, [session.id, session.organization_id, content.trim()]);

            // Update session
                await client.query(`
                UPDATE chat_sessions SET
                    last_seen_at = CURRENT_TIMESTAMP,
                    is_online = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [session.id]);

                // Update widget stats
                await client.query(`
                UPDATE chat_widgets SET
                    total_messages = total_messages + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [session.widget_id]);
                return { session, message: messageResult.rows[0] };
            });

            if (!data.session) {
                return res.status(404).json({ error: 'Session not found or ended' });
            }

            // Notify agents via WebSocket
            if (io) {
                io.to(`org-chat-${data.session.organization_id}`).emit('newChatMessage', {
                    session_id: data.session.id,
                    message: data.message,
                    timestamp: new Date().toISOString()
                });

            }

            res.status(201).json(data.message);
        } catch (error) {
            console.error('Error sending visitor message:', error);
            return sendError(res, 'Failed to send message');
        }
    });

    /**
     * POST /api/chat-widget/public/end-session - End chat session
     */
    router.post('/public/end-session', publicRateLimit, async (req, res) => {
        try {
            const { session_token } = req.body;

            if (!session_token) {
                return res.status(400).json({ error: 'session_token is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE chat_sessions SET
                    status = 'ended',
                    is_online = FALSE,
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE session_token = $1 AND status = 'active'
                RETURNING id, organization_id
            `, [session_token]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Notify agents
            if (io) {
                io.to(`org-chat-${result.rows[0].organization_id}`).emit('chatSessionEnded', {
                    session_id: result.rows[0].id,
                    timestamp: new Date().toISOString()
                });
            }
            if (broadcast?.endChatSession) {
                await broadcast.endChatSession(session_token);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error ending session:', error);
            return sendError(res, 'Failed to end session');
        }
    });

    /**
     * POST /api/chat-widget/public/typing - Send typing indicator
     */
    router.post('/public/typing', publicRateLimit, async (req, res) => {
        try {
            const { session_token, is_typing } = req.body;

            if (!session_token) {
                return res.status(400).json({ error: 'session_token is required' });
            }

            const sessionResult = await withDbClient(pool, async (client) => client.query(
                `SELECT id, organization_id FROM chat_sessions
                 WHERE session_token = $1 AND status = 'active'`,
                [session_token]
            ));

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Broadcast typing indicator to agents
            if (io) {
                io.to(`org-chat-${sessionResult.rows[0].organization_id}`).emit('visitorTyping', {
                    session_id: sessionResult.rows[0].id,
                    is_typing: is_typing !== false,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error sending typing indicator:', error);
            return sendError(res, 'Failed to send typing indicator');
        }
    });

    return router;
};
