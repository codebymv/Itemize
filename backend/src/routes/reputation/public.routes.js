const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const {
    REVIEW_REQUEST_COLUMNS,
    REVIEW_WIDGET_COLUMNS
} = require('./columns');

module.exports = ({ pool, publicRateLimit, getSentiment }) => {
    const router = express.Router();

// Public Endpoints
    // ======================

    /**
     * GET /api/reputation/public/widget/:widgetKey - Get widget data
     */
    router.get('/public/widget/:widgetKey', publicRateLimit, async (req, res) => {
        try {
            const { widgetKey } = req.params;
            const data = await withDbClient(pool, async (client) => {
                // Get widget config
                const widgetResult = await client.query(`
                    SELECT ${REVIEW_WIDGET_COLUMNS} FROM review_widgets
                    WHERE widget_key = $1 AND is_active = TRUE
                `, [widgetKey]);

                if (widgetResult.rows.length === 0) {
                    return { status: 404, error: 'Widget not found' };
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

                return { status: 200, widget, reviewsResult };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json({
                config: {
                    widget_type: data.widget.widget_type,
                    theme: data.widget.theme,
                    primary_color: data.widget.primary_color,
                    background_color: data.widget.background_color,
                    text_color: data.widget.text_color,
                    border_radius: data.widget.border_radius,
                    show_rating_stars: data.widget.show_rating_stars,
                    show_reviewer_photo: data.widget.show_reviewer_photo,
                    show_review_date: data.widget.show_review_date,
                    show_platform_icon: data.widget.show_platform_icon
                },
                reviews: data.reviewsResult.rows
            });
        } catch (error) {
            console.error('Error fetching widget data:', error);
            return sendError(res, 'Failed to fetch widget data');
        }
    });

    /**
     * GET /api/reputation/public/review/:token - Review submission page data
     */
    router.get('/public/review/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const result = await client.query(`
                    SELECT ${REVIEW_REQUEST_COLUMNS.split(', ').map(column => `rr.${column}`).join(', ')},
                           o.name as organization_name
                    FROM review_requests rr
                    JOIN organizations o ON rr.organization_id = o.id
                    WHERE rr.unique_token = $1 AND rr.status NOT IN ('completed', 'unsubscribed')
                `, [token]);

                if (result.rows.length === 0) {
                    return { status: 404, error: 'Review request not found or expired' };
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

                return { status: 200, request };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json({
                organization_name: data.request.organization_name,
                contact_name: data.request.contact_name,
                redirect_url: data.request.redirect_url,
                preferred_platform: data.request.preferred_platform
            });
        } catch (error) {
            console.error('Error fetching review request:', error);
            return sendError(res, 'Failed to fetch review request');
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

            const data = await withDbClient(pool, async (client) => {
                const requestResult = await client.query(`
                    SELECT ${REVIEW_REQUEST_COLUMNS} FROM review_requests
                    WHERE unique_token = $1 AND status NOT IN ('completed', 'unsubscribed')
                `, [token]);

                if (requestResult.rows.length === 0) {
                    return { status: 404, error: 'Review request not found' };
                }

                const request = requestResult.rows[0];

                // Create review
                const reviewResult = await client.query(`
                    INSERT INTO reviews (
                        organization_id, platform, rating, review_text,
                        reviewer_name, reviewer_email, reviewer_phone, contact_id,
                        sentiment, source, review_request_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'request', $10)
                    RETURNING id
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

                return { status: 200, request };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json({ 
                success: true, 
                redirect_url: rating >= 4 ? data.request.redirect_url : null
            });
        } catch (error) {
            console.error('Error submitting review:', error);
            return sendError(res, 'Failed to submit review');
        }
    });

    return router;
};
