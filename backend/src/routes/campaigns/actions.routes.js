const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { campaignColumns } = require('./columns');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * POST /api/campaigns/:id/schedule - Schedule campaign
     */
    router.post('/:id/schedule', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const { scheduled_at, timezone } = req.body;

            if (!scheduled_at) {
                return sendBadRequest(res, 'scheduled_at is required');
            }

            const scheduledDate = new Date(scheduled_at);
            if (scheduledDate <= new Date()) {
                return sendBadRequest(res, 'Scheduled time must be in the future');
            }

            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT status FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                if (!['draft', 'scheduled'].includes(checkResult.rows[0].status)) {
                    return { status: 'invalid_status' };
                }

                const updateResult = await client.query(`
                    UPDATE email_campaigns SET
                        status = 'scheduled',
                        scheduled_at = $1,
                        timezone = $2,
                        send_immediately = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3 AND organization_id = $4
                    RETURNING ${campaignColumns()}
                `, [scheduled_at, timezone || 'UTC', id, req.organizationId]);

                return { status: 'ok', campaign: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }
            if (result.status === 'invalid_status') {
                return sendBadRequest(res, 'Campaign cannot be scheduled');
            }

            sendSuccess(res, result.campaign);
        } catch (error) {
            console.error('Error scheduling campaign:', error);
            return sendError(res, 'Failed to schedule campaign');
        }
    }));

    /**
     * POST /api/campaigns/:id/unschedule - Unschedule campaign (back to draft)
     */
    router.post('/:id/unschedule', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    UPDATE email_campaigns SET
                        status = 'draft',
                        scheduled_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND status = 'scheduled'
                    RETURNING ${campaignColumns()}
                `, [id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Campaign');
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error unscheduling campaign:', error);
            return sendError(res, 'Failed to unschedule campaign');
        }
    }));

    return router;
};
