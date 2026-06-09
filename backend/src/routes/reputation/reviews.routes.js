const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { REVIEW_COLUMNS } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization, getSentiment }) => {
    const router = express.Router();

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

            const { countResult, result } = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM reviews r ${whereClause}`,
                    params
                );

                const result = await client.query(`
                    SELECT ${REVIEW_COLUMNS.split(', ').map(column => `r.${column}`).join(', ')},
                           rp.platform_name,
                           c.first_name as contact_first_name, c.last_name as contact_last_name
                    FROM reviews r
                    LEFT JOIN review_platforms rp ON r.platform_id = rp.id
                    LEFT JOIN contacts c ON r.contact_id = c.id
                    ${whereClause}
                    ORDER BY r.review_date DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return { countResult, result };
            });

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
            return sendError(res, 'Failed to fetch reviews');
        }
    });

    /**
     * GET /api/reputation/reviews/:id - Get single review
     */
    router.get('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
                SELECT ${REVIEW_COLUMNS.split(', ').map(column => `r.${column}`).join(', ')},
                       rp.platform_name, rp.review_url,
                       c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                FROM reviews r
                LEFT JOIN review_platforms rp ON r.platform_id = rp.id
                LEFT JOIN contacts c ON r.contact_id = c.id
                WHERE r.id = $1 AND r.organization_id = $2
            `, [id, req.organizationId]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching review:', error);
            return sendError(res, 'Failed to fetch review');
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

            const result = await withDbClient(pool, async (client) => client.query(`
                INSERT INTO reviews (
                    organization_id, platform_id, platform, rating, review_text,
                    reviewer_name, reviewer_email, reviewer_phone, contact_id,
                    sentiment, source, review_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', $11)
                RETURNING ${REVIEW_COLUMNS}
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
            ]));
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating review:', error);
            return sendError(res, 'Failed to create review');
        }
    });

    /**
     * PUT /api/reputation/reviews/:id - Update review
     */
    router.put('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, response_text, internal_notes, contact_id } = req.body;

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

            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE reviews SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING ${REVIEW_COLUMNS}
            `, params));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating review:', error);
            return sendError(res, 'Failed to update review');
        }
    });

    /**
     * DELETE /api/reputation/reviews/:id - Delete review
     */
    router.delete('/reviews/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'DELETE FROM reviews WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting review:', error);
            return sendError(res, 'Failed to delete review');
        }
    });

    // ======================

    return router;
};
