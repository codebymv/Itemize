const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { campaignColumns, campaignRecipientColumns } = require('./columns');
const { normalizeCampaignAudience, compileCampaignAudience } = require('../../services/campaignAudience');
const { SegmentValidationError } = require('../../services/segmentFilter');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/campaigns/:id/recipients - Get campaign recipients
     */
    router.get('/:id/recipients', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const { status, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE cr.campaign_id = $1';
            const params = [id];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND cr.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const countResult = await client.query(
                    `SELECT COUNT(*) FROM campaign_recipients cr ${whereClause}`,
                    params
                );

                const recipientsResult = await client.query(`
                    SELECT ${campaignRecipientColumns('cr')},
                        c.first_name as contact_first_name,
                        c.last_name as contact_last_name
                    FROM campaign_recipients cr
                    LEFT JOIN contacts c ON cr.contact_id = c.id
                    ${whereClause}
                    ORDER BY cr.sent_at DESC NULLS LAST
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return {
                    status: 'ok',
                    recipients: recipientsResult.rows,
                    total: parseInt(countResult.rows[0].count)
                };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }

            sendSuccess(res, {
                recipients: result.recipients,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    totalPages: Math.ceil(result.total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching campaign recipients:', error);
            return sendError(res, 'Failed to fetch recipients');
        }
    }));

    /**
     * GET /api/campaigns/:id/preview - Preview campaign recipient count
     */
    router.get('/:id/preview', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const campaignResult = await client.query(
                    `SELECT ${campaignColumns()} FROM email_campaigns WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (campaignResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const campaign = campaignResult.rows[0];
                const audience = await normalizeCampaignAudience(client, req.organizationId, campaign);
                const countParams = [req.organizationId];
                const compiledAudience = compileCampaignAudience(audience, {
                    alias: 'c',
                    startIndex: countParams.length + 1,
                });
                const countResult = await client.query(`
                    SELECT COUNT(DISTINCT c.email) as total
                    FROM contacts c
                    WHERE c.organization_id = $1
                        AND c.email IS NOT NULL
                        AND c.email != ''
                        AND (c.email_unsubscribed IS NULL OR c.email_unsubscribed = FALSE)
                        AND (c.email_bounced IS NULL OR c.email_bounced = FALSE)
                        AND ${compiledAudience.condition}
                `, [...countParams, ...compiledAudience.params]);

                return {
                    status: 'ok',
                    campaign,
                    recipientCount: Number(countResult.rows[0].total),
                };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }

            const campaign = result.campaign;

            sendSuccess(res, {
                recipientCount: result.recipientCount,
                segmentType: campaign.segment_type,
                segmentId: campaign.segment_id,
                tagIds: campaign.tag_ids,
                excludedTagIds: campaign.excluded_tag_ids
            });
        } catch (error) {
            if (error instanceof SegmentValidationError) {
                return sendBadRequest(res, error.message, error.field);
            }
            console.error('Error previewing campaign:', error);
            return sendError(res, 'Failed to preview campaign');
        }
    }));

    return router;
};
