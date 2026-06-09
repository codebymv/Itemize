const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendCreated, sendPaginated, sendBadRequest, sendNotFound, sendError, getPaginationParams, buildPagination } = require('../../utils/response');
const { campaignColumns, campaignLinkColumns } = require('./columns');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    // ======================
    // Campaign CRUD
    // ======================

    /**
     * GET /api/campaigns - List campaigns
     */
    router.get('/', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { status, search } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);

        const result = await withDbClient(pool, async (client) => {
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

            const countResult = await client.query(
                `SELECT COUNT(*) FROM email_campaigns c ${whereClause}`,
                params
            );

            const campaignsResult = await client.query(`
                SELECT ${campaignColumns('c')},
                    et.name as template_name,
                    u.name as created_by_name
                FROM email_campaigns c
                LEFT JOIN email_templates et ON c.template_id = et.id
                LEFT JOIN users u ON c.created_by = u.id
                ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);

            return {
                campaigns: campaignsResult.rows,
                total: parseInt(countResult.rows[0].count)
            };
        });

        const pagination = buildPagination(page, limit, result.total);
        return sendPaginated(res, result.campaigns, pagination);
    }));

    /**
     * GET /api/campaigns/:id - Get campaign details
     */
    router.get('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const campaignResult = await client.query(`
                SELECT ${campaignColumns('c')},
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

                if (campaignResult.rows.length === 0) {
                    return { notFound: true };
                }

                const linksResult = await client.query(`
                SELECT ${campaignLinkColumns()} FROM campaign_links WHERE campaign_id = $1 ORDER BY link_position
                `, [id]);

                const campaign = campaignResult.rows[0];
                campaign.links = linksResult.rows;
                return { campaign };
            });

            if (result.notFound) {
                return sendNotFound(res, 'Campaign');
            }

            return sendSuccess(res, result.campaign);
    }));

    /**
     * POST /api/campaigns - Create campaign
     */
    router.post('/', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
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
                return sendBadRequest(res, 'Name and subject are required');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    INSERT INTO email_campaigns (
                        organization_id, name, subject, from_name, from_email, reply_to,
                        template_id, content_html, content_text,
                        segment_type, segment_filter, tag_ids, excluded_tag_ids,
                        created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING ${campaignColumns()}
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
            });

            sendCreated(res, result.rows[0]);
        } catch (error) {
            console.error('Error creating campaign:', error);
            return sendError(res, 'Failed to create campaign');
        }
    }));

    /**
     * PUT /api/campaigns/:id - Update campaign
     */
    router.put('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
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
                    RETURNING ${campaignColumns()}
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

                return { status: 'ok', campaign: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }
            if (result.status === 'invalid_status') {
                return sendBadRequest(res, 'Cannot edit campaign that has been sent');
            }

            sendSuccess(res, result.campaign);
        } catch (error) {
            console.error('Error updating campaign:', error);
            return sendError(res, 'Failed to update campaign');
        }
    }));

    /**
     * DELETE /api/campaigns/:id - Delete campaign
     */
    router.delete('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT status FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                if (checkResult.rows[0].status === 'sending') {
                    return { status: 'sending' };
                }

                await client.query(
                    'DELETE FROM email_campaigns WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                return { status: 'ok' };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }
            if (result.status === 'sending') {
                return sendBadRequest(res, 'Cannot delete campaign that is currently sending');
            }

            sendSuccess(res, { success: true });
        } catch (error) {
            console.error('Error deleting campaign:', error);
            return sendError(res, 'Failed to delete campaign');
        }
    }));

    /**
     * POST /api/campaigns/:id/duplicate - Duplicate campaign
     */
    router.post('/:id/duplicate', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const original = await client.query(
                    `SELECT ${campaignColumns()} FROM email_campaigns WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (original.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const campaign = original.rows[0];

                const insertResult = await client.query(`
                    INSERT INTO email_campaigns (
                        organization_id, name, subject, from_name, from_email, reply_to,
                        template_id, content_html, content_text,
                        segment_type, segment_filter, tag_ids, excluded_tag_ids,
                        created_by, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
                    RETURNING ${campaignColumns()}
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

                return { status: 'ok', campaign: insertResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Campaign');
            }

            sendCreated(res, result.campaign);
        } catch (error) {
            console.error('Error duplicating campaign:', error);
            return sendError(res, 'Failed to duplicate campaign');
        }
    }));

    // ======================
    // Campaign Actions
    // ======================

    return router;
};
