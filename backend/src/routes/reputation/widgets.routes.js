const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const crypto = require('crypto');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Review Widgets
    // ======================

    /**
     * GET /api/reputation/widgets - List widgets
     */
    router.get('/widgets', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(
                'SELECT * FROM review_widgets WHERE organization_id = $1 ORDER BY name ASC',
                [req.organizationId]
            ));
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching widgets:', error);
            return sendError(res, 'Failed to fetch widgets');
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

            const result = await withDbClient(pool, async (client) => client.query(`
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
            ]));
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating widget:', error);
            return sendError(res, 'Failed to create widget');
        }
    });

    /**
     * PUT /api/reputation/widgets/:id - Update widget
     */
    router.put('/widgets/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

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

            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE review_widgets SET ${fields.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating widget:', error);
            return sendError(res, 'Failed to update widget');
        }
    });

    /**
     * DELETE /api/reputation/widgets/:id - Delete widget
     */
    router.delete('/widgets/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'DELETE FROM review_widgets WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Widget not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting widget:', error);
            return sendError(res, 'Failed to delete widget');
        }
    });

    /**
     * GET /api/reputation/widgets/:id/embed-code - Get embed code
     */
    router.get('/widgets/:id/embed-code', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'SELECT widget_key FROM review_widgets WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            ));

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
            return sendError(res, 'Failed to get embed code');
        }
    });

    // ======================

    return router;
};
