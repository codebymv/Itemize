const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const UsageTrackingService = require('../../services/usageTrackingService');
const { sendCampaignEmails } = require('./delivery');
const { campaignColumns, campaignRecipientColumns } = require('./columns');
const { normalizeCampaignAudience, compileCampaignAudience } = require('../../services/campaignAudience');
const { SegmentValidationError } = require('../../services/segmentFilter');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();
    const usageService = new UsageTrackingService(pool);



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

    /**
     * POST /api/campaigns/:id/send - Send campaign immediately
     */
    router.post('/:id/send', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const outcome = await withTransaction(pool, async (client) => {
                const campaignResult = await client.query(`
                    SELECT ${campaignColumns('c')}, et.body_html as template_html, et.body_text as template_text
                    FROM email_campaigns c
                    LEFT JOIN email_templates et ON c.template_id = et.id
                    WHERE c.id = $1 AND c.organization_id = $2
                    FOR UPDATE OF c
                `, [id, req.organizationId]);

                if (campaignResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const campaign = campaignResult.rows[0];

                if (!['draft', 'scheduled'].includes(campaign.status)) {
                    return { status: 'invalid_status' };
                }

                let recipientQuery = `
                    SELECT DISTINCT ON (c.email)
                        c.id, c.email, c.first_name, c.last_name
                    FROM contacts c
                    WHERE c.organization_id = $1
                        AND c.email IS NOT NULL
                        AND c.email != ''
                        AND (c.email_unsubscribed IS NULL OR c.email_unsubscribed = FALSE)
                        AND (c.email_bounced IS NULL OR c.email_bounced = FALSE)
                `;
                const recipientParams = [req.organizationId];
                const audience = await normalizeCampaignAudience(
                    client,
                    req.organizationId,
                    campaign
                );
                const compiledAudience = compileCampaignAudience(audience, {
                    alias: 'c',
                    startIndex: recipientParams.length + 1,
                });
                recipientQuery += ` AND ${compiledAudience.condition}`;
                recipientQuery += ' ORDER BY c.email, c.id';
                recipientParams.push(...compiledAudience.params);

                const recipientsResult = await client.query(recipientQuery, recipientParams);
                const recipients = recipientsResult.rows;

                if (recipients.length === 0) {
                    return { status: 'no_recipients' };
                }

                const usageLimitCheck = await usageService.isWithinLimits(
                    req.organizationId,
                    'emails_per_month',
                    recipients.length
                );

                if (!usageLimitCheck.withinLimits) {
                    return { status: 'usage_exceeded', usage: usageLimitCheck, recipientsCount: recipients.length };
                }

                await client.query(`
                    UPDATE email_campaigns SET
                        status = 'sending',
                        started_at = CURRENT_TIMESTAMP,
                        sent_by = $1,
                        total_recipients = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [req.user.id, recipients.length, id]);

                const recipientValues = [];
                const recipientInsertParams = [];
                recipients.forEach((recipient, index) => {
                    const baseIndex = index * 6;
                    recipientInsertParams.push(
                        id,
                        recipient.id,
                        req.organizationId,
                        recipient.email,
                        recipient.first_name,
                        recipient.last_name
                    );
                    recipientValues.push(
                        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
                    );
                });

                if (recipientValues.length > 0) {
                    await client.query(
                        `
                            INSERT INTO campaign_recipients (
                                campaign_id, contact_id, organization_id, email, first_name, last_name
                            ) VALUES ${recipientValues.join(', ')}
                            ON CONFLICT (campaign_id, contact_id) DO NOTHING
                        `,
                        recipientInsertParams
                    );
                }

                const updatedResult = await client.query(
                    `SELECT ${campaignColumns()} FROM email_campaigns WHERE id = $1`,
                    [id]
                );

                return {
                    status: 'ok',
                    campaign: updatedResult.rows[0],
                    recipients,
                    recipientCount: recipients.length
                };
            });

            if (outcome.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }
            if (outcome.status === 'invalid_status') {
                return sendBadRequest(res, 'Campaign cannot be sent');
            }
            if (outcome.status === 'no_recipients') {
                return sendBadRequest(res, 'No recipients match the campaign criteria');
            }
            if (outcome.status === 'usage_exceeded') {
                return sendError(
                    res,
                    `Sending ${outcome.recipientsCount} emails would exceed your monthly limit`,
                    429,
                    'USAGE_LIMIT_EXCEEDED',
                    {
                        current: outcome.usage.current,
                        limit: outcome.usage.limit,
                        requested: outcome.recipientsCount,
                        remaining: outcome.usage.remaining || 0
                    }
                );
            }

            await usageService.incrementUsage(req.organizationId, 'emails_per_month', outcome.recipientCount);

            sendCampaignEmails(pool, id, outcome.campaign, outcome.recipients).catch(err => {
                console.error('Error sending campaign emails:', err);
            });

            sendSuccess(res, {
                campaign: outcome.campaign,
                recipientCount: outcome.recipientCount,
                message: 'Campaign is now sending'
            });
        } catch (error) {
            if (error instanceof SegmentValidationError) {
                return sendBadRequest(res, error.message, error.field);
            }
            console.error('Error sending campaign:', error);
            return sendError(res, 'Failed to send campaign');
        }
    }));

    /**
     * POST /api/campaigns/:id/pause - Pause sending campaign
     */
    router.post('/:id/pause', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    UPDATE email_campaigns SET
                        status = 'paused',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND status = 'sending'
                    RETURNING ${campaignColumns()}
                `, [id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Campaign');
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error pausing campaign:', error);
            return sendError(res, 'Failed to pause campaign');
        }
    }));

    /**
     * POST /api/campaigns/:id/resume - Resume paused campaign
     */
    router.post('/:id/resume', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const campaignResult = await client.query(`
                    SELECT ${campaignColumns('c')}, et.body_html as template_html, et.body_text as template_text
                    FROM email_campaigns c
                    LEFT JOIN email_templates et ON c.template_id = et.id
                    WHERE c.id = $1 AND c.organization_id = $2 AND c.status = 'paused'
                `, [id, req.organizationId]);

                if (campaignResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const campaign = campaignResult.rows[0];

                const recipientsResult = await client.query(`
                    SELECT ${campaignRecipientColumns('cr')}, c.email, c.first_name, c.last_name
                    FROM campaign_recipients cr
                    JOIN contacts c ON cr.contact_id = c.id
                    WHERE cr.campaign_id = $1 AND cr.status = 'pending'
                      AND COALESCE(c.email_unsubscribed, FALSE) = FALSE
                      AND COALESCE(c.email_bounced, FALSE) = FALSE
                `, [id]);

                const recipients = recipientsResult.rows;

                if (recipients.length === 0) {
                    await client.query(`
                        UPDATE email_campaigns SET status = 'sent', completed_at = CURRENT_TIMESTAMP WHERE id = $1
                    `, [id]);
                    return { status: 'completed' };
                }

                await client.query(`
                    UPDATE email_campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = $1
                `, [id]);

                return { status: 'ok', campaign, recipients };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }
            if (result.status === 'completed') {
                return sendSuccess(res, { message: 'Campaign already fully sent' });
            }

            sendCampaignEmails(pool, id, result.campaign, result.recipients).catch(err => {
                console.error('Error resuming campaign emails:', err);
            });

            sendSuccess(res, { message: 'Campaign resumed', pendingRecipients: result.recipients.length });
        } catch (error) {
            console.error('Error resuming campaign:', error);
            return sendError(res, 'Failed to resume campaign');
        }
    }));

    return router;
};
