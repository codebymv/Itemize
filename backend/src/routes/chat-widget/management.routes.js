const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { generateWidgetKey } = require('./helpers');
const { chatWidgetColumns } = require('./columns');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    // ====================================

    /**
     * GET /api/chat-widget - Get organization's chat widget config
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(`
                SELECT ${chatWidgetColumns()} FROM chat_widgets WHERE organization_id = $1
            `, [req.organizationId]));

            // Return first widget or null
            res.json(result.rows[0] || null);
        } catch (error) {
            console.error('Error fetching chat widget:', error);
            return sendError(res, 'Failed to fetch chat widget');
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
            const data = await withDbClient(pool, async (client) => {
                // Check if widget already exists for this org
                const existingResult = await client.query(
                    'SELECT id FROM chat_widgets WHERE organization_id = $1',
                    [req.organizationId]
                );

                if (existingResult.rows.length > 0) {
                    return { error: 'Widget already exists for this organization. Use PUT to update.', result: null };
                }

                const result = await client.query(`
                INSERT INTO chat_widgets (
                    organization_id, widget_key, name, primary_color, text_color, position,
                    welcome_title, welcome_message, placeholder_text,
                    require_email, require_name, require_phone, custom_fields,
                    auto_open_delay, show_branding, business_hours, offline_message,
                    default_assigned_to, allowed_domains
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING ${chatWidgetColumns()}
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
                return { error: null, result };
            });

            if (data.error) {
                return res.status(400).json({ error: data.error });
            }

            res.status(201).json(data.result.rows[0]);
        } catch (error) {
            console.error('Error creating chat widget:', error);
            return sendError(res, 'Failed to create chat widget');
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

            const result = await withDbClient(pool, async (client) => client.query(`
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
                RETURNING ${chatWidgetColumns()}
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
            ]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating chat widget:', error);
            return sendError(res, 'Failed to update chat widget');
        }
    });

    /**

     */
    router.get('/embed-code', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(
                'SELECT widget_key FROM chat_widgets WHERE organization_id = $1',
                [req.organizationId]
            ));

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
            return sendError(res, 'Failed to generate embed code');
        }
    });

    // ====================================
    // PUBLIC WIDGET ENDPOINTS (for visitors)
    // ====================================

    return router;
};
