/**
 * Email Campaigns Routes
 * CRUD operations and campaign sending functionality
 * Refactored with shared middleware (Phase 5)
 * Updated with feature gating (Subscription Phase 6)
 */

const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const UsageTrackingService = require('../services/usageTrackingService');

module.exports = (pool, authenticateJWT) => {
    // Use shared organization middleware (Phase 5.3)
    const { requireOrganization } = require('../middleware/organization')(pool);
    
    // Subscription middleware for feature gating
    const { checkUsageLimit } = require('../middleware/subscription')(pool);
    
    // Usage tracking service
    const usageService = new UsageTrackingService(pool);

    // ======================
    // Campaign CRUD
    // ======================

    /**
     * GET /api/campaigns - List campaigns
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, page = 1, limit = 20, search } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE c.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND c.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.subject ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM email_campaigns c ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT c.*,
                    et.name as template_name,
                    u.name as created_by_name
                FROM email_campaigns c
                LEFT JOIN email_templates et ON c.template_id = et.id
                LEFT JOIN users u ON c.created_by = u.id
                ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                campaigns: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching campaigns:', error);
            res.status(500).json({ error: 'Failed to fetch campaigns' });
        }
    });

    /**
     * GET /api/campaigns/:id - Get campaign details
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                SELECT c.*,
                    et.name as template_name,
                    et.body_html as template_html,
                    u.name as created_by_name,
                    su.name as sent_by_name
                FROM email_campaigns c
                LEFT JOIN email_templates et ON c.template_id = et.id
                LEFT JOIN users u ON c.created_by = u.id
                LEFT JOIN users su ON c.sent_by = su.id
                WHERE c.id = $1 AND c.organization_id = $2
            `, [id, req.organizationId]);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            // Get link stats
            const linksResult = await client.query(`
                SELECT * FROM campaign_links WHERE campaign_id = $1 ORDER BY link_position
            `, [id]);

            client.release();

            const campaign = result.rows[0];
            campaign.links = linksResult.rows;

            res.json(campaign);
        } catch (error) {
            console.error('Error fetching campaign:', error);
            res.status(500).json({ error: 'Failed to fetch campaign' });
        }
    });

    /**
     * POST /api/campaigns - Create campaign
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                subject,
                from_name,
                from_email,
                reply_to,
                template_id,
                content_html,
                content_text,
                segment_type,
                segment_filter,
                tag_ids,
                excluded_tag_ids
            } = req.body;

            if (!name || !subject) {
                return res.status(400).json({ error: 'Name and subject are required' });
            }

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO email_campaigns (
                    organization_id, name, subject, from_name, from_email, reply_to,
                    template_id, content_html, content_text,
                    segment_type, segment_filter, tag_ids, excluded_tag_ids,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
            `, [
                req.organizationId,
                name,
                subject,
                from_name,
                from_email,
                reply_to,
                template_id || null,
                content_html || null,
                content_text || null,
                segment_type || 'all',
                JSON.stringify(segment_filter || {}),
                tag_ids || [],
                excluded_tag_ids || [],
                req.user.id
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating campaign:', error);
            res.status(500).json({ error: 'Failed to create campaign' });
        }
    });

    /**
     * PUT /api/campaigns/:id - Update campaign
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                subject,
                from_name,
                from_email,
                reply_to,
                template_id,
                content_html,
                content_text,
                segment_type,
                segment_filter,
                tag_ids,
                excluded_tag_ids
            } = req.body;

            const client = await pool.connect();

            // Check if campaign can be edited
            const checkResult = await client.query(
                'SELECT status FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            if (!['draft', 'scheduled'].includes(checkResult.rows[0].status)) {
                client.release();
                return res.status(400).json({ error: 'Cannot edit campaign that has been sent' });
            }

            const result = await client.query(`
                UPDATE email_campaigns SET
                    name = COALESCE($1, name),
                    subject = COALESCE($2, subject),
                    from_name = $3,
                    from_email = $4,
                    reply_to = $5,
                    template_id = $6,
                    content_html = $7,
                    content_text = $8,
                    segment_type = COALESCE($9, segment_type),
                    segment_filter = COALESCE($10, segment_filter),
                    tag_ids = COALESCE($11, tag_ids),
                    excluded_tag_ids = COALESCE($12, excluded_tag_ids),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $13 AND organization_id = $14
                RETURNING *
            `, [
                name,
                subject,
                from_name,
                from_email,
                reply_to,
                template_id,
                content_html,
                content_text,
                segment_type,
                segment_filter ? JSON.stringify(segment_filter) : null,
                tag_ids,
                excluded_tag_ids,
                id,
                req.organizationId
            ]);

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating campaign:', error);
            res.status(500).json({ error: 'Failed to update campaign' });
        }
    });

    /**
     * DELETE /api/campaigns/:id - Delete campaign
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Check if campaign can be deleted
            const checkResult = await client.query(
                'SELECT status FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            if (checkResult.rows[0].status === 'sending') {
                client.release();
                return res.status(400).json({ error: 'Cannot delete campaign that is currently sending' });
            }

            await client.query(
                'DELETE FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            client.release();
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting campaign:', error);
            res.status(500).json({ error: 'Failed to delete campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/duplicate - Duplicate campaign
     */
    router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const original = await client.query(
                'SELECT * FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (original.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            const campaign = original.rows[0];

            const result = await client.query(`
                INSERT INTO email_campaigns (
                    organization_id, name, subject, from_name, from_email, reply_to,
                    template_id, content_html, content_text,
                    segment_type, segment_filter, tag_ids, excluded_tag_ids,
                    created_by, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
                RETURNING *
            `, [
                req.organizationId,
                `${campaign.name} (Copy)`,
                campaign.subject,
                campaign.from_name,
                campaign.from_email,
                campaign.reply_to,
                campaign.template_id,
                campaign.content_html,
                campaign.content_text,
                campaign.segment_type,
                campaign.segment_filter,
                campaign.tag_ids,
                campaign.excluded_tag_ids,
                req.user.id
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error duplicating campaign:', error);
            res.status(500).json({ error: 'Failed to duplicate campaign' });
        }
    });

    // ======================
    // Campaign Actions
    // ======================

    /**
     * POST /api/campaigns/:id/schedule - Schedule campaign
     */
    router.post('/:id/schedule', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { scheduled_at, timezone } = req.body;

            if (!scheduled_at) {
                return res.status(400).json({ error: 'scheduled_at is required' });
            }

            const scheduledDate = new Date(scheduled_at);
            if (scheduledDate <= new Date()) {
                return res.status(400).json({ error: 'Scheduled time must be in the future' });
            }

            const client = await pool.connect();

            // Verify campaign exists and is in draft status
            const checkResult = await client.query(
                'SELECT status FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            if (!['draft', 'scheduled'].includes(checkResult.rows[0].status)) {
                client.release();
                return res.status(400).json({ error: 'Campaign cannot be scheduled' });
            }

            const result = await client.query(`
                UPDATE email_campaigns SET
                    status = 'scheduled',
                    scheduled_at = $1,
                    timezone = $2,
                    send_immediately = FALSE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 AND organization_id = $4
                RETURNING *
            `, [scheduled_at, timezone || 'UTC', id, req.organizationId]);

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error scheduling campaign:', error);
            res.status(500).json({ error: 'Failed to schedule campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/unschedule - Unschedule campaign (back to draft)
     */
    router.post('/:id/unschedule', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                UPDATE email_campaigns SET
                    status = 'draft',
                    scheduled_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2 AND status = 'scheduled'
                RETURNING *
            `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found or not scheduled' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error unscheduling campaign:', error);
            res.status(500).json({ error: 'Failed to unschedule campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/send - Send campaign immediately
     */
    router.post('/:id/send', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Get campaign
                const campaignResult = await client.query(`
                    SELECT c.*, et.body_html as template_html, et.body_text as template_text
                    FROM email_campaigns c
                    LEFT JOIN email_templates et ON c.template_id = et.id
                    WHERE c.id = $1 AND c.organization_id = $2
                `, [id, req.organizationId]);

                if (campaignResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(404).json({ error: 'Campaign not found' });
                }

                const campaign = campaignResult.rows[0];

                if (!['draft', 'scheduled'].includes(campaign.status)) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(400).json({ error: 'Campaign cannot be sent' });
                }

                // Build recipient query based on segment
                let recipientQuery = `
                    SELECT c.id, c.email, c.first_name, c.last_name
                    FROM contacts c
                    WHERE c.organization_id = $1
                        AND c.email IS NOT NULL 
                        AND c.email != ''
                        AND (c.email_unsubscribed IS NULL OR c.email_unsubscribed = FALSE)
                        AND (c.email_bounced IS NULL OR c.email_bounced = FALSE)
                `;
                const recipientParams = [req.organizationId];

                if (campaign.segment_type === 'tag' && campaign.tag_ids?.length > 0) {
                    recipientQuery += ` AND c.id IN (
                        SELECT ct.contact_id FROM contact_tags ct WHERE ct.tag_id = ANY($2)
                    )`;
                    recipientParams.push(campaign.tag_ids);
                }

                if (campaign.segment_type === 'status' && campaign.segment_filter?.status) {
                    recipientQuery += ` AND c.status = $${recipientParams.length + 1}`;
                    recipientParams.push(campaign.segment_filter.status);
                }

                // Exclude contacts with certain tags
                if (campaign.excluded_tag_ids?.length > 0) {
                    recipientQuery += ` AND c.id NOT IN (
                        SELECT ct.contact_id FROM contact_tags ct WHERE ct.tag_id = ANY($${recipientParams.length + 1})
                    )`;
                    recipientParams.push(campaign.excluded_tag_ids);
                }

                const recipientsResult = await client.query(recipientQuery, recipientParams);
                const recipients = recipientsResult.rows;

                if (recipients.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(400).json({ error: 'No recipients match the campaign criteria' });
                }

                // Check email usage limits before sending
                const usageLimitCheck = await usageService.isWithinLimits(
                    req.organizationId, 
                    'emails_per_month', 
                    recipients.length
                );
                
                if (!usageLimitCheck.withinLimits) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(429).json({
                        success: false,
                        error: {
                            message: `Sending ${recipients.length} emails would exceed your monthly limit`,
                            code: 'USAGE_LIMIT_EXCEEDED',
                            current: usageLimitCheck.current,
                            limit: usageLimitCheck.limit,
                            requested: recipients.length,
                            remaining: usageLimitCheck.remaining || 0
                        }
                    });
                }

                // Update campaign status
                await client.query(`
                    UPDATE email_campaigns SET
                        status = 'sending',
                        started_at = CURRENT_TIMESTAMP,
                        sent_by = $1,
                        total_recipients = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [req.user.id, recipients.length, id]);

                // Insert recipients
                for (const recipient of recipients) {
                    await client.query(`
                        INSERT INTO campaign_recipients (
                            campaign_id, contact_id, organization_id, email, first_name, last_name
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (campaign_id, contact_id) DO NOTHING
                    `, [id, recipient.id, req.organizationId, recipient.email, recipient.first_name, recipient.last_name]);
                }

                await client.query('COMMIT');

                // Track email usage (pre-allocate the quota)
                await usageService.incrementUsage(req.organizationId, 'emails_per_month', recipients.length);

                // Start sending in background
                sendCampaignEmails(pool, id, campaign, recipients).catch(err => {
                    console.error('Error sending campaign emails:', err);
                });

                // Get updated campaign
                const updatedResult = await client.query(
                    'SELECT * FROM email_campaigns WHERE id = $1',
                    [id]
                );

                client.release();
                res.json({
                    campaign: updatedResult.rows[0],
                    recipientCount: recipients.length,
                    message: 'Campaign is now sending'
                });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error sending campaign:', error);
            res.status(500).json({ error: 'Failed to send campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/pause - Pause sending campaign
     */
    router.post('/:id/pause', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                UPDATE email_campaigns SET
                    status = 'paused',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2 AND status = 'sending'
                RETURNING *
            `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found or not sending' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error pausing campaign:', error);
            res.status(500).json({ error: 'Failed to pause campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/resume - Resume paused campaign
     */
    router.post('/:id/resume', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Get campaign and pending recipients
            const campaignResult = await client.query(`
                SELECT c.*, et.body_html as template_html, et.body_text as template_text
                FROM email_campaigns c
                LEFT JOIN email_templates et ON c.template_id = et.id
                WHERE c.id = $1 AND c.organization_id = $2 AND c.status = 'paused'
            `, [id, req.organizationId]);

            if (campaignResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found or not paused' });
            }

            const campaign = campaignResult.rows[0];

            // Get pending recipients
            const recipientsResult = await client.query(`
                SELECT cr.*, c.email, c.first_name, c.last_name
                FROM campaign_recipients cr
                JOIN contacts c ON cr.contact_id = c.id
                WHERE cr.campaign_id = $1 AND cr.status = 'pending'
            `, [id]);

            const recipients = recipientsResult.rows;

            if (recipients.length === 0) {
                // All sent, mark as complete
                await client.query(`
                    UPDATE email_campaigns SET status = 'sent', completed_at = CURRENT_TIMESTAMP WHERE id = $1
                `, [id]);
                client.release();
                return res.json({ message: 'Campaign already fully sent' });
            }

            // Update status
            await client.query(`
                UPDATE email_campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [id]);

            client.release();

            // Resume sending in background
            sendCampaignEmails(pool, id, campaign, recipients).catch(err => {
                console.error('Error resuming campaign emails:', err);
            });

            res.json({ message: 'Campaign resumed', pendingRecipients: recipients.length });
        } catch (error) {
            console.error('Error resuming campaign:', error);
            res.status(500).json({ error: 'Failed to resume campaign' });
        }
    });

    // ======================
    // Campaign Analytics
    // ======================

    /**
     * GET /api/campaigns/:id/recipients - Get campaign recipients
     */
    router.get('/:id/recipients', authenticateJWT, requireOrganization, async (req, res) => {
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

            const client = await pool.connect();

            // Verify campaign belongs to org
            const checkResult = await client.query(
                'SELECT id FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            const countResult = await client.query(
                `SELECT COUNT(*) FROM campaign_recipients cr ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT cr.*,
                    c.first_name as contact_first_name,
                    c.last_name as contact_last_name
                FROM campaign_recipients cr
                LEFT JOIN contacts c ON cr.contact_id = c.id
                ${whereClause}
                ORDER BY cr.sent_at DESC NULLS LAST
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                recipients: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching campaign recipients:', error);
            res.status(500).json({ error: 'Failed to fetch recipients' });
        }
    });

    /**
     * GET /api/campaigns/:id/preview - Preview campaign recipient count
     */
    router.get('/:id/preview', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const campaignResult = await client.query(
                'SELECT * FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (campaignResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Campaign not found' });
            }

            const campaign = campaignResult.rows[0];

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

            const result = await client.query(countQuery, countParams);
            client.release();

            res.json({
                recipientCount: parseInt(result.rows[0].total),
                segmentType: campaign.segment_type,
                tagIds: campaign.tag_ids,
                excludedTagIds: campaign.excluded_tag_ids
            });
        } catch (error) {
            console.error('Error previewing campaign:', error);
            res.status(500).json({ error: 'Failed to preview campaign' });
        }
    });

    /**
     * POST /api/campaigns/:id/send-test - Send test email
     */
    router.post('/:id/send-test', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { test_email } = req.body;

            if (!test_email) {
                return res.status(400).json({ error: 'test_email is required' });
            }

            const client = await pool.connect();

            const campaignResult = await client.query(`
                SELECT c.*, et.body_html as template_html, et.body_text as template_text
                FROM email_campaigns c
                LEFT JOIN email_templates et ON c.template_id = et.id
                WHERE c.id = $1 AND c.organization_id = $2
            `, [id, req.organizationId]);

            client.release();

            if (campaignResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found' });
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

            res.json({
                success: true,
                message: `Test email sent to ${test_email}`,
                emailId: result?.id
            });
        } catch (error) {
            console.error('Error sending test email:', error);
            res.status(500).json({ error: 'Failed to send test email' });
        }
    });

    return router;
};

/**
 * Background function to send campaign emails
 */
async function sendCampaignEmails(pool, campaignId, campaign, recipients) {
    console.log(`Starting to send campaign ${campaignId} to ${recipients.length} recipients`);

    const client = await pool.connect();
    let sentCount = 0;
    let failedCount = 0;

    const htmlContent = campaign.content_html || campaign.template_html || '';
    const textContent = campaign.content_text || campaign.template_text || '';

    for (const recipient of recipients) {
        try {
            // Check if campaign was paused or cancelled
            const statusCheck = await client.query(
                'SELECT status FROM email_campaigns WHERE id = $1',
                [campaignId]
            );

            if (!statusCheck.rows.length || !['sending'].includes(statusCheck.rows[0].status)) {
                console.log(`Campaign ${campaignId} stopped - status: ${statusCheck.rows[0]?.status}`);
                break;
            }

            // Replace variables
            const variables = {
                first_name: recipient.first_name || '',
                last_name: recipient.last_name || '',
                email: recipient.email,
                full_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim()
            };

            let processedHtml = htmlContent;
            let processedText = textContent;
            Object.entries(variables).forEach(([key, value]) => {
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
                processedHtml = processedHtml.replace(regex, value);
                processedText = processedText.replace(regex, value);
            });

            // Send email
            const result = await emailService.sendEmail({
                to: recipient.email,
                subject: campaign.subject,
                html: processedHtml,
                text: processedText,
                fromName: campaign.from_name,
                fromEmail: campaign.from_email,
                replyTo: campaign.reply_to
            });

            // Update recipient status
            await client.query(`
                UPDATE campaign_recipients SET
                    status = 'sent',
                    sent_at = CURRENT_TIMESTAMP,
                    external_message_id = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE campaign_id = $2 AND contact_id = $3
            `, [result?.id || null, campaignId, recipient.contact_id || recipient.id]);

            sentCount++;

            // Update campaign stats periodically
            if (sentCount % 10 === 0) {
                await client.query(`
                    UPDATE email_campaigns SET
                        total_sent = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [sentCount, campaignId]);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`Failed to send to ${recipient.email}:`, error.message);
            failedCount++;

            await client.query(`
                UPDATE campaign_recipients SET
                    status = 'failed',
                    error_message = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE campaign_id = $2 AND contact_id = $3
            `, [error.message, campaignId, recipient.contact_id || recipient.id]);
        }
    }

    // Final update
    await client.query(`
        UPDATE email_campaigns SET
            status = 'sent',
            total_sent = $1,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
    `, [sentCount, campaignId]);

    client.release();
    console.log(`Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);
}
