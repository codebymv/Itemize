const express = require('express');
const emailService = require('../../services/emailService');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { campaignColumns, campaignRecipientColumns } = require('./columns');

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

                return { status: 'ok', campaign: campaignResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }

            const campaign = result.campaign;

            // Build recipient count query
            let countQuery = `
                SELECT COUNT(*) as total
                FROM contacts c
                WHERE c.organization_id = $1
                    AND c.email IS NOT NULL
                    AND c.email != ''
                    AND (c.email_unsubscribed IS NULL OR c.email_unsubscribed = FALSE)
                    AND (c.email_bounced IS NULL OR c.email_bounced = FALSE)
            `;
            const countParams = [req.organizationId];

            if (campaign.segment_type === 'tag' && campaign.tag_ids?.length > 0) {
                countQuery += ` AND c.id IN (
                    SELECT ct.contact_id FROM contact_tags ct WHERE ct.tag_id = ANY($2)
                )`;
                countParams.push(campaign.tag_ids);
            }

            if (campaign.segment_type === 'status' && campaign.segment_filter?.status) {
                countQuery += ` AND c.status = $${countParams.length + 1}`;
                countParams.push(campaign.segment_filter.status);
            }

            if (campaign.excluded_tag_ids?.length > 0) {
                countQuery += ` AND c.id NOT IN (
                    SELECT ct.contact_id FROM contact_tags ct WHERE ct.tag_id = ANY($${countParams.length + 1})
                )`;
                countParams.push(campaign.excluded_tag_ids);
            }

            const countResult = await withDbClient(pool, async (client) => {
                return client.query(countQuery, countParams);
            });

            sendSuccess(res, {
                recipientCount: parseInt(countResult.rows[0].total),
                segmentType: campaign.segment_type,
                tagIds: campaign.tag_ids,
                excludedTagIds: campaign.excluded_tag_ids
            });
        } catch (error) {
            console.error('Error previewing campaign:', error);
            return sendError(res, 'Failed to preview campaign');
        }
    }));

    /**
     * POST /api/campaigns/:id/send-test - Send test email
     */
    router.post('/:id/send-test', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const { test_email } = req.body;

            if (!test_email) {
                return sendBadRequest(res, 'test_email is required');
            }

            const campaignResult = await withDbClient(pool, async (client) => {
                return client.query(`
                    SELECT ${campaignColumns('c')}, et.body_html as template_html, et.body_text as template_text
                    FROM email_campaigns c
                    LEFT JOIN email_templates et ON c.template_id = et.id
                    WHERE c.id = $1 AND c.organization_id = $2
                `, [id, req.organizationId]);
            });

            if (campaignResult.rows.length === 0) {
                return sendNotFound(res, 'Campaign');
            }

            const campaign = campaignResult.rows[0];
            const htmlContent = campaign.content_html || campaign.template_html || '';
            const textContent = campaign.content_text || campaign.template_text || '';

            // Replace variables with test data
            const testData = {
                first_name: 'Test',
                last_name: 'User',
                email: test_email,
                company: 'Test Company'
            };

            let processedHtml = htmlContent;
            let processedText = textContent;
            Object.entries(testData).forEach(([key, value]) => {
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
                processedHtml = processedHtml.replace(regex, value);
                processedText = processedText.replace(regex, value);
            });

            // Send test email
            const result = await emailService.sendEmail({
                to: test_email,
                subject: `[TEST] ${campaign.subject}`,
                html: processedHtml,
                text: processedText,
                fromName: campaign.from_name,
                fromEmail: campaign.from_email,
                replyTo: campaign.reply_to
            });

            sendSuccess(res, {
                success: true,
                message: `Test email sent to ${test_email}`,
                emailId: result?.id
            });
        } catch (error) {
            console.error('Error sending test email:', error);
            return sendError(res, 'Failed to send test email');
        }
    }));

    return router;
};
