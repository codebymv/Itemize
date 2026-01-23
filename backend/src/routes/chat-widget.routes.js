/**
 * Chat Widget Routes
 * Handles chat widget configuration and public chat endpoints
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * Generate a unique widget key
 */
function generateWidgetKey() {
    return 'cw_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a unique session token
 */
function generateSessionToken() {
    return 'cs_' + crypto.randomBytes(24).toString('hex');
}

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

    // ====================================
    // AUTHENTICATED WIDGET MANAGEMENT
    // ====================================

    /**
     * GET /api/chat-widget - Get organization's chat widget config
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            
            const result = await client.query(`
                SELECT * FROM chat_widgets WHERE organization_id = $1
            `, [req.organizationId]);
            
            client.release();
            
            // Return first widget or null
            res.json(result.rows[0] || null);
        } catch (error) {
            console.error('Error fetching chat widget:', error);
            res.status(500).json({ error: 'Failed to fetch chat widget' });
        }
    });

    /**
     * POST /api/chat-widget - Create chat widget for organization
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                primary_color,
                text_color,
                position,
                welcome_title,
                welcome_message,
                placeholder_text,
                require_email,
                require_name,
                require_phone,
                custom_fields,
                auto_open_delay,
                show_branding,
                business_hours,
                offline_message,
                default_assigned_to,
                allowed_domains
            } = req.body;

            const widgetKey = generateWidgetKey();
            const client = await pool.connect();

            // Check if widget already exists for this org
            const existingResult = await client.query(
                'SELECT id FROM chat_widgets WHERE organization_id = $1',
                [req.organizationId]
            );

            if (existingResult.rows.length > 0) {
                client.release();
                return res.status(400).json({ error: 'Widget already exists for this organization. Use PUT to update.' });
            }

            const result = await client.query(`
                INSERT INTO chat_widgets (
                    organization_id, widget_key, name, primary_color, text_color, position,
                    welcome_title, welcome_message, placeholder_text,
                    require_email, require_name, require_phone, custom_fields,
                    auto_open_delay, show_branding, business_hours, offline_message,
                    default_assigned_to, allowed_domains
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING *
            `, [
                req.organizationId,
                widgetKey,
                name || 'Chat Widget',
                primary_color || '#3B82F6',
                text_color || '#FFFFFF',
                position || 'bottom-right',
                welcome_title || 'Hi there! 👋',
                welcome_message || 'How can we help you today?',
                placeholder_text || 'Type your message...',
                require_email !== false,
                require_name !== false,
                require_phone || false,
                JSON.stringify(custom_fields || []),
                auto_open_delay || 0,
                show_branding !== false,
                business_hours ? JSON.stringify(business_hours) : null,
                offline_message || 'We are currently offline. Please leave a message.',
                default_assigned_to || null,
                allowed_domains || []
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating chat widget:', error);
            res.status(500).json({ error: 'Failed to create chat widget' });
        }
    });

    /**
     * PUT /api/chat-widget - Update chat widget
     */
    router.put('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                primary_color,
                text_color,
                position,
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
                notification_sound,
                business_hours,
                offline_message,
                default_assigned_to,
                auto_assign_available,
                allowed_domains
            } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
                UPDATE chat_widgets SET
                    name = COALESCE($1, name),
                    primary_color = COALESCE($2, primary_color),
                    text_color = COALESCE($3, text_color),
                    position = COALESCE($4, position),
                    welcome_title = COALESCE($5, welcome_title),
                    welcome_message = COALESCE($6, welcome_message),
                    placeholder_text = COALESCE($7, placeholder_text),
                    require_email = COALESCE($8, require_email),
                    require_name = COALESCE($9, require_name),
                    require_phone = COALESCE($10, require_phone),
                    custom_fields = COALESCE($11, custom_fields),
                    is_active = COALESCE($12, is_active),
                    auto_open_delay = COALESCE($13, auto_open_delay),
                    show_branding = COALESCE($14, show_branding),
                    notification_sound = COALESCE($15, notification_sound),
                    business_hours = $16,
                    offline_message = COALESCE($17, offline_message),
                    default_assigned_to = $18,
                    auto_assign_available = COALESCE($19, auto_assign_available),
                    allowed_domains = COALESCE($20, allowed_domains),
                    updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = $21
                RETURNING *
            `, [
                name,
                primary_color,
                text_color,
                position,
                welcome_title,
                welcome_message,
                placeholder_text,
                require_email,
                require_name,
                require_phone,
                custom_fields ? JSON.stringify(custom_fields) : null,
                is_active,
                auto_open_delay,
                show_branding,
                notification_sound,
                business_hours ? JSON.stringify(business_hours) : null,
                offline_message,
                default_assigned_to,
                auto_assign_available,
                allowed_domains,
                req.organizationId
            ]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating chat widget:', error);
            res.status(500).json({ error: 'Failed to update chat widget' });
        }
    });

    /**
     * GET /api/chat-widget/sessions - List active chat sessions
     */
    router.get('/sessions', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status = 'active', page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            const client = await pool.connect();

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
                SELECT cs.*,
                    cw.name as widget_name,
                    (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id AND is_read = FALSE AND sender_type = 'visitor') as unread_count,
                    (SELECT content FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message
                FROM chat_sessions cs
                LEFT JOIN chat_widgets cw ON cs.widget_id = cw.id
                ${whereClause}
                ORDER BY cs.last_seen_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                sessions: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching chat sessions:', error);
            res.status(500).json({ error: 'Failed to fetch chat sessions' });
        }
    });

    /**
     * GET /api/chat-widget/sessions/:id - Get session with messages
     */
    router.get('/sessions/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const sessionResult = await client.query(`
                SELECT cs.*, cw.name as widget_name
                FROM chat_sessions cs
                LEFT JOIN chat_widgets cw ON cs.widget_id = cw.id
                WHERE cs.id = $1 AND cs.organization_id = $2
            `, [id, req.organizationId]);

            if (sessionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Session not found' });
            }

            const messagesResult = await client.query(`
                SELECT cm.*, u.name as agent_name
                FROM chat_messages cm
                LEFT JOIN users u ON cm.sender_user_id = u.id
                WHERE cm.session_id = $1
                ORDER BY cm.created_at ASC
            `, [id]);

            client.release();

            const session = sessionResult.rows[0];
            session.messages = messagesResult.rows;

            res.json(session);
        } catch (error) {
            console.error('Error fetching chat session:', error);
            res.status(500).json({ error: 'Failed to fetch chat session' });
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

            const client = await pool.connect();

            // Verify session
            const sessionCheck = await client.query(
                'SELECT id, session_token FROM chat_sessions WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (sessionCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Session not found' });
            }

            // Insert message
            const messageResult = await client.query(`
                INSERT INTO chat_messages (session_id, organization_id, sender_type, sender_user_id, content)
                VALUES ($1, $2, 'agent', $3, $4)
                RETURNING *
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
                SELECT cm.*, u.name as agent_name
                FROM chat_messages cm
                LEFT JOIN users u ON cm.sender_user_id = u.id
                WHERE cm.id = $1
            `, [messageResult.rows[0].id]);

            client.release();

            // Broadcast to visitor via WebSocket
            if (io) {
                const sessionToken = sessionCheck.rows[0].session_token;
                io.to(`chat-session-${sessionToken}`).emit('newChatMessage', {
                    message: fullMessage.rows[0],
                    timestamp: new Date().toISOString()
                });
            }

            res.status(201).json(fullMessage.rows[0]);
        } catch (error) {
            console.error('Error sending agent message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    /**
     * POST /api/chat-widget/sessions/:id/convert - Convert session to contact
     */
    router.post('/sessions/:id/convert', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Get session
            const sessionResult = await client.query(
                'SELECT * FROM chat_sessions WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (sessionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = sessionResult.rows[0];

            if (session.contact_id) {
                client.release();
                return res.status(400).json({ error: 'Session already converted to contact' });
            }

            try {
                await client.query('BEGIN');

                // Create contact
                const contactResult = await client.query(`
                    INSERT INTO contacts (
                        organization_id, first_name, last_name, email, phone, source, status
                    ) VALUES ($1, $2, $3, $4, $5, 'chat_widget', 'lead')
                    RETURNING *
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
                    RETURNING *
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

                await client.query('COMMIT');
                client.release();

                res.json({
                    success: true,
                    contact_id: contactId,
                    conversation_id: conversationResult.rows[0].id
                });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error converting chat session:', error);
            res.status(500).json({ error: 'Failed to convert session' });
        }
    });

    /**
     * GET /api/chat-widget/embed-code - Get embed code for website
     */
    router.get('/embed-code', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            
            const result = await client.query(
                'SELECT widget_key FROM chat_widgets WHERE organization_id = $1',
                [req.organizationId]
            );
            
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found. Create one first.' });
            }

            const widgetKey = result.rows[0].widget_key;
            const baseUrl = process.env.FRONTEND_URL || 'https://itemize.cloud';

            const embedCode = `<!-- Itemize Chat Widget -->
<script>
(function(w,d,s,o,f,js,fjs){
w['ItemizeChat']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
}(window,document,'script','ichat','${baseUrl}/widget.js'));
ichat('init', '${widgetKey}');
</script>`;

            res.json({
                widget_key: widgetKey,
                embed_code: embedCode
            });
        } catch (error) {
            console.error('Error generating embed code:', error);
            res.status(500).json({ error: 'Failed to generate embed code' });
        }
    });

    // ====================================
    // PUBLIC WIDGET ENDPOINTS (for visitors)
    // ====================================

    /**
     * GET /api/chat-widget/public/config/:widgetKey - Get widget config for embedding
     */
    router.get('/public/config/:widgetKey', publicRateLimit, async (req, res) => {
        try {
            const { widgetKey } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
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
            `, [widgetKey]);

            client.release();

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
            res.status(500).json({ error: 'Failed to fetch widget config' });
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

            const client = await pool.connect();

            // Get widget
            const widgetResult = await client.query(
                'SELECT id, organization_id, require_email, require_name, require_phone FROM chat_widgets WHERE widget_key = $1 AND is_active = TRUE',
                [widget_key]
            );

            if (widgetResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Widget not found or inactive' });
            }

            const widget = widgetResult.rows[0];

            // Validate required fields
            if (widget.require_email && !visitor_email) {
                client.release();
                return res.status(400).json({ error: 'Email is required' });
            }
            if (widget.require_name && !visitor_name) {
                client.release();
                return res.status(400).json({ error: 'Name is required' });
            }
            if (widget.require_phone && !visitor_phone) {
                client.release();
                return res.status(400).json({ error: 'Phone is required' });
            }

            // Check for existing session with same email
            if (visitor_email) {
                const existingSession = await client.query(`
                    SELECT id, session_token FROM chat_sessions 
                    WHERE widget_id = $1 AND visitor_email = $2 AND status = 'active'
                    ORDER BY created_at DESC LIMIT 1
                `, [widget.id, visitor_email]);

                if (existingSession.rows.length > 0) {
                    client.release();
                    return res.json({
                        session_token: existingSession.rows[0].session_token,
                        session_id: existingSession.rows[0].id,
                        resumed: true
                    });
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

            client.release();

            // Notify agents via WebSocket
            if (io) {
                io.to(`org-${widget.organization_id}`).emit('newChatSession', {
                    session_id: sessionResult.rows[0].id,
                    visitor_name,
                    visitor_email,
                    timestamp: new Date().toISOString()
                });
            }

            res.status(201).json({
                session_token: sessionToken,
                session_id: sessionResult.rows[0].id,
                resumed: false
            });
        } catch (error) {
            console.error('Error starting chat session:', error);
            res.status(500).json({ error: 'Failed to start chat session' });
        }
    });

    /**
     * GET /api/chat-widget/public/messages/:sessionToken - Get messages for session
     */
    router.get('/public/messages/:sessionToken', publicRateLimit, async (req, res) => {
        try {
            const { sessionToken } = req.params;
            const { after } = req.query; // For polling new messages

            const client = await pool.connect();

            // Verify session
            const sessionResult = await client.query(
                'SELECT id, status FROM chat_sessions WHERE session_token = $1',
                [sessionToken]
            );

            if (sessionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Session not found' });
            }

            let query = `
                SELECT cm.*, u.name as agent_name
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
                UPDATE chat_sessions SET last_seen_at = CURRENT_TIMESTAMP, is_online = TRUE WHERE id = $1
            `, [sessionResult.rows[0].id]);

            client.release();

            res.json(messagesResult.rows);
        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ error: 'Failed to fetch messages' });
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

            const client = await pool.connect();

            // Get session
            const sessionResult = await client.query(`
                SELECT cs.id, cs.organization_id, cs.widget_id 
                FROM chat_sessions cs
                WHERE cs.session_token = $1 AND cs.status = 'active'
            `, [session_token]);

            if (sessionResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Session not found or ended' });
            }

            const session = sessionResult.rows[0];

            // Insert message
            const messageResult = await client.query(`
                INSERT INTO chat_messages (session_id, organization_id, sender_type, content)
                VALUES ($1, $2, 'visitor', $3)
                RETURNING *
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

            client.release();

            // Notify agents via WebSocket
            if (io) {
                io.to(`org-${session.organization_id}`).emit('newChatMessage', {
                    session_id: session.id,
                    message: messageResult.rows[0],
                    timestamp: new Date().toISOString()
                });
            }

            res.status(201).json(messageResult.rows[0]);
        } catch (error) {
            console.error('Error sending visitor message:', error);
            res.status(500).json({ error: 'Failed to send message' });
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

            const client = await pool.connect();

            const result = await client.query(`
                UPDATE chat_sessions SET 
                    status = 'ended',
                    is_online = FALSE,
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE session_token = $1
                RETURNING id, organization_id
            `, [session_token]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Notify agents
            if (io) {
                io.to(`org-${result.rows[0].organization_id}`).emit('chatSessionEnded', {
                    session_id: result.rows[0].id,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error ending session:', error);
            res.status(500).json({ error: 'Failed to end session' });
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

            const client = await pool.connect();

            const sessionResult = await client.query(
                'SELECT id, organization_id FROM chat_sessions WHERE session_token = $1',
                [session_token]
            );

            client.release();

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Broadcast typing indicator to agents
            if (io) {
                io.to(`org-${sessionResult.rows[0].organization_id}`).emit('visitorTyping', {
                    session_id: sessionResult.rows[0].id,
                    is_typing: is_typing !== false,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error sending typing indicator:', error);
            res.status(500).json({ error: 'Failed to send typing indicator' });
        }
    });

    return router;
};
