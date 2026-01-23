/**
 * Reputation Management Routes
 * Review collection, management, and widgets
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = (pool, authenticateJWT, publicRateLimit) => {

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

    /**
     * Calculate sentiment from rating
     */
    function getSentiment(rating) {
        if (rating >= 4) return 'positive';
        if (rating >= 3) return 'neutral';
        return 'negative';
    }

    // ======================
    // Review Platform Management
    // ======================

    /**
     * GET /api/reputation/platforms - List connected platforms
     */
    router.get('/platforms', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(`
                SELECT * FROM review_platforms
                WHERE organization_id = $1
                ORDER BY platform ASC
            `, [req.organizationId]);
            client.release();

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching platforms:', error);
            res.status(500).json({ error: 'Failed to fetch platforms' });
        }
    });

    /**
     * POST /api/reputation/platforms - Add review platform
     */
    router.post('/platforms', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { platform, platform_name, place_id, page_id, business_url, review_url } = req.body;

            if (!platform) {
                return res.status(400).json({ error: 'Platform is required' });
            }

            const client = await pool.connect();
            const result = await client.query(`
                INSERT INTO review_platforms (
                    organization_id, platform, platform_name, place_id, page_id,
                    business_url, review_url, is_connected
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                ON CONFLICT (organization_id, platform, place_id) DO UPDATE SET
                    platform_name = EXCLUDED.platform_name,
                    page_id = EXCLUDED.page_id,
                    business_url = EXCLUDED.business_url,
                    review_url = EXCLUDED.review_url,
                    is_connected = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                req.organizationId,
                platform,
                platform_name || platform,
                place_id || null,
                page_id || null,
                business_url || null,
                review_url || null
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error adding platform:', error);
            res.status(500).json({ error: 'Failed to add platform' });
        }
    });

    /**
     * DELETE /api/reputation/platforms/:id - Remove platform
     */
    router.delete('/platforms/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();
            
            const result = await client.query(
                'DELETE FROM review_platforms WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Platform not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error removing platform:', error);
            res.status(500).json({ error: 'Failed to remove platform' });
        }
    });

    // ======================
    // Reviews CRUD
    // ======================

    /**
     * GET /api/reputation/reviews - List reviews
     */
    router.get('/reviews', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { platform, rating, status, sentiment, page = 1, limit = 20, search } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE r.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (platform && platform !== 'all') {
                whereClause += ` AND r.platform = $${paramIndex}`;
                params.push(platform);
                paramIndex++;
            }

            if (rating) {
                whereClause += ` AND r.rating = $${paramIndex}`;
                params.push(parseInt(rating));
                paramIndex++;
            }

            if (status && status !== 'all') {
                whereClause += ` AND r.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (sentiment && sentiment !== 'all') {
                whereClause += ` AND r.sentiment = $${paramIndex}`;
                params.push(sentiment);
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND (r.reviewer_name ILIKE $${paramIndex} OR r.review_text ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM reviews r ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT r.*, rp.platform_name,
                       c.first_name as contact_first_name, c.last_name as contact_last_name
                FROM reviews r
                LEFT JOIN review_platforms rp ON r.platform_id = rp.id
                LEFT JOIN contacts c ON r.contact_id = c.id
                ${whereClause}
                ORDER BY r.review_date DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                reviews: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching reviews:', error);
            res.status(500).json({ error: 'Failed to fetch reviews' });
        }
    });

    /**
     * GET /api/reputation/reviews/:id - Get single review
     */
    router.get('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                SELECT r.*, rp.platform_name, rp.review_url,
                       c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                FROM reviews r
                LEFT JOIN review_platforms rp ON r.platform_id = rp.id
                LEFT JOIN contacts c ON r.contact_id = c.id
                WHERE r.id = $1 AND r.organization_id = $2
            `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching review:', error);
            res.status(500).json({ error: 'Failed to fetch review' });
        }
    });

    /**
     * POST /api/reputation/reviews - Add manual review
     */
    router.post('/reviews', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                platform,
                platform_id,
                rating,
                review_text,
                reviewer_name,
                reviewer_email,
                reviewer_phone,
                contact_id,
                review_date
            } = req.body;

            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Valid rating (1-5) is required' });
            }

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO reviews (
                    organization_id, platform_id, platform, rating, review_text,
                    reviewer_name, reviewer_email, reviewer_phone, contact_id,
                    sentiment, source, review_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', $11)
                RETURNING *
            `, [
                req.organizationId,
                platform_id || null,
                platform || 'custom',
                rating,
                review_text || null,
                reviewer_name || null,
                reviewer_email || null,
                reviewer_phone || null,
                contact_id || null,
                getSentiment(rating),
                review_date || new Date()
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating review:', error);
            res.status(500).json({ error: 'Failed to create review' });
        }
    });

    /**
     * PUT /api/reputation/reviews/:id - Update review
     */
    router.put('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, response_text, internal_notes, contact_id } = req.body;

            const client = await pool.connect();

            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (status) {
                updates.push(`status = $${paramIndex++}`);
                params.push(status);
            }

            if (response_text !== undefined) {
                updates.push(`response_text = $${paramIndex++}`);
                params.push(response_text);
                if (response_text && response_text.trim()) {
                    updates.push(`responded_at = CURRENT_TIMESTAMP`);
                    updates.push(`responded_by = $${paramIndex++}`);
                    params.push(req.user.id);
                    updates.push(`status = 'responded'`);
                }
            }

            if (internal_notes !== undefined) {
                updates.push(`internal_notes = $${paramIndex++}`);
                params.push(internal_notes);
            }

            if (contact_id !== undefined) {
                updates.push(`contact_id = $${paramIndex++}`);
                params.push(contact_id);
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');

            params.push(id, req.organizationId);

            const result = await client.query(`
                UPDATE reviews SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating review:', error);
            res.status(500).json({ error: 'Failed to update review' });
        }
    });

    /**
     * DELETE /api/reputation/reviews/:id - Delete review
     */
    router.delete('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM reviews WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting review:', error);
            res.status(500).json({ error: 'Failed to delete review' });
        }
    });

    // ======================
    // Review Requests
    // ======================

    /**
     * GET /api/reputation/requests - List review requests
     */
    router.get('/requests', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE rr.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND rr.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM review_requests rr ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT rr.*, c.first_name, c.last_name, c.email
                FROM review_requests rr
                LEFT JOIN contacts c ON rr.contact_id = c.id
                ${whereClause}
                ORDER BY rr.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                requests: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching review requests:', error);
            res.status(500).json({ error: 'Failed to fetch review requests' });
        }
    });

    /**
     * POST /api/reputation/requests - Send review request
     */
    router.post('/requests', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                contact_id,
                contact_email,
                contact_phone,
                contact_name,
                channel,
                custom_message,
                preferred_platform,
                redirect_url,
                scheduled_at
            } = req.body;

            if (!contact_id && !contact_email && !contact_phone) {
                return res.status(400).json({ error: 'Contact information required' });
            }

            if (!channel) {
                return res.status(400).json({ error: 'Channel (email/sms/both) required' });
            }

            const client = await pool.connect();

            // Get contact info if contact_id provided
            let contactInfo = {
                email: contact_email,
                phone: contact_phone,
                name: contact_name
            };

            if (contact_id) {
                const contactResult = await client.query(
                    'SELECT email, phone, first_name, last_name FROM contacts WHERE id = $1 AND organization_id = $2',
                    [contact_id, req.organizationId]
                );

                if (contactResult.rows.length > 0) {
                    const c = contactResult.rows[0];
                    contactInfo.email = contactInfo.email || c.email;
                    contactInfo.phone = contactInfo.phone || c.phone;
                    contactInfo.name = contactInfo.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
                }
            }

            // Generate unique token
            const uniqueToken = crypto.randomBytes(32).toString('hex');

            // Get default redirect URL from settings
            let reviewUrl = redirect_url;
            if (!reviewUrl) {
                const settingsResult = await client.query(
                    'SELECT default_review_url FROM reputation_settings WHERE organization_id = $1',
                    [req.organizationId]
                );
                reviewUrl = settingsResult.rows[0]?.default_review_url;
            }

            const result = await client.query(`
                INSERT INTO review_requests (
                    organization_id, contact_id, contact_email, contact_phone, contact_name,
                    channel, custom_message, preferred_platform, redirect_url,
                    scheduled_at, unique_token, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `, [
                req.organizationId,
                contact_id || null,
                contactInfo.email,
                contactInfo.phone,
                contactInfo.name,
                channel,
                custom_message || null,
                preferred_platform || null,
                reviewUrl,
                scheduled_at || null,
                uniqueToken,
                scheduled_at ? 'pending' : 'sent'
            ]);

            const request = result.rows[0];

            // If not scheduled, send immediately
            if (!scheduled_at) {
                // Mark as sent
                await client.query(`
                    UPDATE review_requests SET
                        email_sent = $1,
                        email_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                        sms_sent = $2,
                        sms_sent_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END
                    WHERE id = $3
                `, [
                    channel === 'email' || channel === 'both',
                    channel === 'sms' || channel === 'both',
                    request.id
                ]);

                // TODO: Actually send email/SMS
                // For now, just update status
            }

            client.release();
            res.status(201).json(request);
        } catch (error) {
            console.error('Error creating review request:', error);
            res.status(500).json({ error: 'Failed to create review request' });
        }
    });

    /**
     * POST /api/reputation/requests/bulk - Send bulk review requests
     */
    router.post('/requests/bulk', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { contact_ids, channel, custom_message, preferred_platform } = req.body;

            if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
                return res.status(400).json({ error: 'Contact IDs array required' });
            }

            const client = await pool.connect();

            // Get contacts
            const contactsResult = await client.query(`
                SELECT id, email, phone, first_name, last_name
                FROM contacts
                WHERE id = ANY($1) AND organization_id = $2
            `, [contact_ids, req.organizationId]);

            const requests = [];
            
            for (const contact of contactsResult.rows) {
                const uniqueToken = crypto.randomBytes(32).toString('hex');

                const result = await client.query(`
                    INSERT INTO review_requests (
                        organization_id, contact_id, contact_email, contact_phone, contact_name,
                        channel, custom_message, preferred_platform, unique_token, status,
                        email_sent, email_sent_at, sms_sent, sms_sent_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent', $10, $11, $12, $13)
                    RETURNING id
                `, [
                    req.organizationId,
                    contact.id,
                    contact.email,
                    contact.phone,
                    `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                    channel || 'email',
                    custom_message || null,
                    preferred_platform || null,
                    uniqueToken,
                    channel === 'email' || channel === 'both',
                    (channel === 'email' || channel === 'both') ? new Date() : null,
                    channel === 'sms' || channel === 'both',
                    (channel === 'sms' || channel === 'both') ? new Date() : null
                ]);

                requests.push(result.rows[0]);
            }

            client.release();
            res.status(201).json({ sent: requests.length, requests });
        } catch (error) {
            console.error('Error sending bulk requests:', error);
            res.status(500).json({ error: 'Failed to send bulk requests' });
        }
    });

    // ======================
    // Review Widgets
    // ======================

    /**
     * GET /api/reputation/widgets - List widgets
     */
    router.get('/widgets', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM review_widgets WHERE organization_id = $1 ORDER BY name ASC',
                [req.organizationId]
            );
            client.release();
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching widgets:', error);
            res.status(500).json({ error: 'Failed to fetch widgets' });
        }
    });

    /**
     * POST /api/reputation/widgets - Create widget
     */
    router.post('/widgets', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                widget_type,
                theme,
                primary_color,
                background_color,
                text_color,
                border_radius,
                show_rating_stars,
                show_reviewer_photo,
                show_review_date,
                show_platform_icon,
                min_rating,
                platforms,
                max_reviews,
                hide_no_text_reviews
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const widgetKey = crypto.randomBytes(16).toString('hex');

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO review_widgets (
                    organization_id, widget_key, name, widget_type, theme,
                    primary_color, background_color, text_color, border_radius,
                    show_rating_stars, show_reviewer_photo, show_review_date, show_platform_icon,
                    min_rating, platforms, max_reviews, hide_no_text_reviews
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *
            `, [
                req.organizationId,
                widgetKey,
                name,
                widget_type || 'carousel',
                theme || 'light',
                primary_color || '#6366F1',
                background_color || '#FFFFFF',
                text_color || '#1F2937',
                border_radius || 8,
                show_rating_stars !== false,
                show_reviewer_photo !== false,
                show_review_date !== false,
                show_platform_icon !== false,
                min_rating || 4,
                platforms || [],
                max_reviews || 10,
                hide_no_text_reviews || false
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating widget:', error);
            res.status(500).json({ error: 'Failed to create widget' });
        }
    });

    /**
     * PUT /api/reputation/widgets/:id - Update widget
     */
    router.put('/widgets/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const client = await pool.connect();

            const fields = [];
            const params = [];
            let paramIndex = 1;

            const allowedFields = [
                'name', 'widget_type', 'theme', 'primary_color', 'background_color',
                'text_color', 'border_radius', 'show_rating_stars', 'show_reviewer_photo',
                'show_review_date', 'show_platform_icon', 'min_rating', 'platforms',
                'max_reviews', 'hide_no_text_reviews', 'is_active'
            ];

            for (const field of allowedFields) {
                if (updates[field] !== undefined) {
                    fields.push(`${field} = $${paramIndex++}`);
                    params.push(updates[field]);
                }
            }

            fields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id, req.organizationId);

            const result = await client.query(`
                UPDATE review_widgets SET ${fields.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating widget:', error);
            res.status(500).json({ error: 'Failed to update widget' });
        }
    });

    /**
     * DELETE /api/reputation/widgets/:id - Delete widget
     */
    router.delete('/widgets/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM review_widgets WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting widget:', error);
            res.status(500).json({ error: 'Failed to delete widget' });
        }
    });

    /**
     * GET /api/reputation/widgets/:id/embed-code - Get embed code
     */
    router.get('/widgets/:id/embed-code', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                'SELECT widget_key FROM review_widgets WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            const widgetKey = result.rows[0].widget_key;
            const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';

            const embedCode = `<!-- Review Widget -->
<div id="review-widget-${widgetKey}"></div>
<script src="${baseUrl}/widget/reviews.js" data-widget-key="${widgetKey}" async></script>`;

            res.json({ embed_code: embedCode, widget_key: widgetKey });
        } catch (error) {
            console.error('Error getting embed code:', error);
            res.status(500).json({ error: 'Failed to get embed code' });
        }
    });

    // ======================
    // Settings
    // ======================

    /**
     * GET /api/reputation/settings - Get settings
     */
    router.get('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM reputation_settings WHERE organization_id = $1',
                [req.organizationId]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.json({
                    auto_request_enabled: false,
                    auto_request_delay_days: 3,
                    auto_request_channel: 'email',
                    negative_threshold: 3,
                    negative_route_internal: true,
                    new_review_notify_email: true
                });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching settings:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    /**
     * PUT /api/reputation/settings - Update settings
     */
    router.put('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const settings = req.body;
            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO reputation_settings (
                    organization_id, auto_request_enabled, auto_request_delay_days, auto_request_channel,
                    auto_request_trigger, email_template_id, sms_template_text, negative_threshold,
                    negative_alert_email, negative_route_internal, positive_route_url, default_review_url,
                    google_place_id, new_review_notify_email, new_review_notify_slack, slack_webhook_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (organization_id) DO UPDATE SET
                    auto_request_enabled = COALESCE(EXCLUDED.auto_request_enabled, reputation_settings.auto_request_enabled),
                    auto_request_delay_days = COALESCE(EXCLUDED.auto_request_delay_days, reputation_settings.auto_request_delay_days),
                    auto_request_channel = COALESCE(EXCLUDED.auto_request_channel, reputation_settings.auto_request_channel),
                    auto_request_trigger = COALESCE(EXCLUDED.auto_request_trigger, reputation_settings.auto_request_trigger),
                    email_template_id = EXCLUDED.email_template_id,
                    sms_template_text = EXCLUDED.sms_template_text,
                    negative_threshold = COALESCE(EXCLUDED.negative_threshold, reputation_settings.negative_threshold),
                    negative_alert_email = EXCLUDED.negative_alert_email,
                    negative_route_internal = COALESCE(EXCLUDED.negative_route_internal, reputation_settings.negative_route_internal),
                    positive_route_url = EXCLUDED.positive_route_url,
                    default_review_url = EXCLUDED.default_review_url,
                    google_place_id = EXCLUDED.google_place_id,
                    new_review_notify_email = COALESCE(EXCLUDED.new_review_notify_email, reputation_settings.new_review_notify_email),
                    new_review_notify_slack = COALESCE(EXCLUDED.new_review_notify_slack, reputation_settings.new_review_notify_slack),
                    slack_webhook_url = EXCLUDED.slack_webhook_url,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                req.organizationId,
                settings.auto_request_enabled,
                settings.auto_request_delay_days,
                settings.auto_request_channel,
                settings.auto_request_trigger,
                settings.email_template_id,
                settings.sms_template_text,
                settings.negative_threshold,
                settings.negative_alert_email,
                settings.negative_route_internal,
                settings.positive_route_url,
                settings.default_review_url,
                settings.google_place_id,
                settings.new_review_notify_email,
                settings.new_review_notify_slack,
                settings.slack_webhook_url
            ]);

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // ======================
    // Analytics
    // ======================

    /**
     * GET /api/reputation/analytics - Get reputation analytics
     */
    router.get('/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30' } = req.query;
            const days = parseInt(period);
            
            const client = await pool.connect();

            // Overall stats
            const overallStats = await client.query(`
                SELECT 
                    COUNT(*) as total_reviews,
                    COALESCE(AVG(rating), 0) as average_rating,
                    COUNT(*) FILTER (WHERE rating >= 4) as positive_reviews,
                    COUNT(*) FILTER (WHERE rating <= 2) as negative_reviews,
                    COUNT(*) FILTER (WHERE status = 'new') as new_reviews,
                    COUNT(*) FILTER (WHERE status = 'responded') as responded_reviews
                FROM reviews
                WHERE organization_id = $1
            `, [req.organizationId]);

            // Period stats
            const periodStats = await client.query(`
                SELECT 
                    COUNT(*) as reviews_count,
                    COALESCE(AVG(rating), 0) as average_rating
                FROM reviews
                WHERE organization_id = $1 AND review_date >= NOW() - INTERVAL '${days} days'
            `, [req.organizationId]);

            // Rating distribution
            const ratingDist = await client.query(`
                SELECT rating, COUNT(*) as count
                FROM reviews
                WHERE organization_id = $1
                GROUP BY rating
                ORDER BY rating DESC
            `, [req.organizationId]);

            // Platform distribution
            const platformDist = await client.query(`
                SELECT platform, COUNT(*) as count, COALESCE(AVG(rating), 0) as avg_rating
                FROM reviews
                WHERE organization_id = $1
                GROUP BY platform
                ORDER BY count DESC
            `, [req.organizationId]);

            // Reviews over time (last 30 days)
            const reviewsOverTime = await client.query(`
                SELECT 
                    DATE_TRUNC('day', review_date) as date,
                    COUNT(*) as count,
                    AVG(rating) as avg_rating
                FROM reviews
                WHERE organization_id = $1 AND review_date >= NOW() - INTERVAL '30 days'
                GROUP BY DATE_TRUNC('day', review_date)
                ORDER BY date
            `, [req.organizationId]);

            // Request stats
            const requestStats = await client.query(`
                SELECT 
                    COUNT(*) as total_sent,
                    COUNT(*) FILTER (WHERE clicked = TRUE) as clicked,
                    COUNT(*) FILTER (WHERE review_submitted = TRUE) as converted
                FROM review_requests
                WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
            `, [req.organizationId]);

            client.release();

            res.json({
                overall: overallStats.rows[0],
                period: {
                    days,
                    ...periodStats.rows[0]
                },
                rating_distribution: ratingDist.rows,
                platform_distribution: platformDist.rows,
                reviews_over_time: reviewsOverTime.rows,
                request_stats: requestStats.rows[0]
            });
        } catch (error) {
            console.error('Error fetching analytics:', error);
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // ======================
    // Public Endpoints
    // ======================

    /**
     * GET /api/reputation/public/widget/:widgetKey - Get widget data
     */
    router.get('/public/widget/:widgetKey', publicRateLimit, async (req, res) => {
        try {
            const { widgetKey } = req.params;
            const client = await pool.connect();

            // Get widget config
            const widgetResult = await client.query(`
                SELECT * FROM review_widgets
                WHERE widget_key = $1 AND is_active = TRUE
            `, [widgetKey]);

            if (widgetResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Widget not found' });
            }

            const widget = widgetResult.rows[0];

            // Get reviews based on widget config
            let platformFilter = '';
            if (widget.platforms && widget.platforms.length > 0) {
                platformFilter = `AND platform = ANY($4)`;
            }

            const reviewsResult = await client.query(`
                SELECT 
                    rating, review_text, reviewer_name, reviewer_avatar_url,
                    platform, review_date
                FROM reviews
                WHERE organization_id = $1 
                    AND rating >= $2
                    ${widget.hide_no_text_reviews ? "AND review_text IS NOT NULL AND review_text != ''" : ''}
                    ${platformFilter}
                ORDER BY review_date DESC
                LIMIT $3
            `, widget.platforms && widget.platforms.length > 0 
                ? [widget.organization_id, widget.min_rating, widget.max_reviews, widget.platforms]
                : [widget.organization_id, widget.min_rating, widget.max_reviews]
            );

            client.release();

            res.json({
                config: {
                    widget_type: widget.widget_type,
                    theme: widget.theme,
                    primary_color: widget.primary_color,
                    background_color: widget.background_color,
                    text_color: widget.text_color,
                    border_radius: widget.border_radius,
                    show_rating_stars: widget.show_rating_stars,
                    show_reviewer_photo: widget.show_reviewer_photo,
                    show_review_date: widget.show_review_date,
                    show_platform_icon: widget.show_platform_icon
                },
                reviews: reviewsResult.rows
            });
        } catch (error) {
            console.error('Error fetching widget data:', error);
            res.status(500).json({ error: 'Failed to fetch widget data' });
        }
    });

    /**
     * GET /api/reputation/public/review/:token - Review submission page data
     */
    router.get('/public/review/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                SELECT rr.*, o.name as organization_name
                FROM review_requests rr
                JOIN organizations o ON rr.organization_id = o.id
                WHERE rr.unique_token = $1 AND rr.status NOT IN ('completed', 'unsubscribed')
            `, [token]);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Review request not found or expired' });
            }

            const request = result.rows[0];

            // Mark as clicked
            await client.query(`
                UPDATE review_requests SET
                    clicked = TRUE,
                    clicked_at = COALESCE(clicked_at, CURRENT_TIMESTAMP),
                    status = CASE WHEN status = 'sent' THEN 'clicked' ELSE status END
                WHERE id = $1
            `, [request.id]);

            client.release();

            res.json({
                organization_name: request.organization_name,
                contact_name: request.contact_name,
                redirect_url: request.redirect_url,
                preferred_platform: request.preferred_platform
            });
        } catch (error) {
            console.error('Error fetching review request:', error);
            res.status(500).json({ error: 'Failed to fetch review request' });
        }
    });

    /**
     * POST /api/reputation/public/review/:token - Submit review from request
     */
    router.post('/public/review/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const { rating, review_text, platform } = req.body;

            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Valid rating (1-5) required' });
            }

            const client = await pool.connect();

            const requestResult = await client.query(`
                SELECT * FROM review_requests WHERE unique_token = $1 AND status NOT IN ('completed', 'unsubscribed')
            `, [token]);

            if (requestResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Review request not found' });
            }

            const request = requestResult.rows[0];

            // Create review
            const reviewResult = await client.query(`
                INSERT INTO reviews (
                    organization_id, platform, rating, review_text,
                    reviewer_name, reviewer_email, reviewer_phone, contact_id,
                    sentiment, source, review_request_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'request', $10)
                RETURNING *
            `, [
                request.organization_id,
                platform || request.preferred_platform || 'custom',
                rating,
                review_text || null,
                request.contact_name,
                request.contact_email,
                request.contact_phone,
                request.contact_id,
                getSentiment(rating),
                request.id
            ]);

            // Update request
            await client.query(`
                UPDATE review_requests SET
                    rating_given = $1,
                    review_submitted = TRUE,
                    review_submitted_at = CURRENT_TIMESTAMP,
                    review_id = $2,
                    status = 'completed'
                WHERE id = $3
            `, [rating, reviewResult.rows[0].id, request.id]);

            client.release();

            res.json({ 
                success: true, 
                redirect_url: rating >= 4 ? request.redirect_url : null
            });
        } catch (error) {
            console.error('Error submitting review:', error);
            res.status(500).json({ error: 'Failed to submit review' });
        }
    });

    return router;
};
