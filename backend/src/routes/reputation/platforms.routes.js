const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Review Platform Management
    // ======================

    /**
     * GET /api/reputation/platforms - List connected platforms
     */
    router.get('/platforms', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(`
                SELECT * FROM review_platforms
                WHERE organization_id = $1
                ORDER BY platform ASC
            `, [req.organizationId]));

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching platforms:', error);
            return sendError(res, 'Failed to fetch platforms');
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

            const result = await withDbClient(pool, async (client) => client.query(`
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
            ]));
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error adding platform:', error);
            return sendError(res, 'Failed to add platform');
        }
    });

    /**
     * DELETE /api/reputation/platforms/:id - Remove platform
     */
    router.delete('/platforms/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'DELETE FROM review_platforms WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Platform not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error removing platform:', error);
            return sendError(res, 'Failed to remove platform');
        }
    });

    // ======================

    return router;
};
