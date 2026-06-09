const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');
const { socialChannelColumns } = require('./columns');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    // Channel Management
    // ======================

    /**
     * GET /api/social/channels - List connected channels
     */
    router.get('/channels', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { channel_type } = req.query;
            let query = `
                SELECT ${socialChannelColumns('sc')}, u.name as created_by_name
                FROM social_channels sc
                LEFT JOIN users u ON sc.created_by = u.id
                WHERE sc.organization_id = $1
            `;
            const params = [req.organizationId];

            if (channel_type) {
                query += ' AND sc.channel_type = $2';
                params.push(channel_type);
            }

            query += ' ORDER BY sc.channel_type, sc.name';

            const result = await withDbClient(pool, async (client) => client.query(query, params));

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching channels:', error);
            return sendError(res, 'Failed to fetch channels');
        }
    });

    /**
     * DELETE /api/social/channels/:id - Disconnect channel
     */
    router.delete('/channels/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
                UPDATE social_channels SET
                    is_connected = FALSE,
                    page_access_token = NULL,
                    user_access_token = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2
                RETURNING id
            `, [id, req.organizationId]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error disconnecting channel:', error);
            return sendError(res, 'Failed to disconnect channel');
        }
    });

    // ======================

    return router;
};
