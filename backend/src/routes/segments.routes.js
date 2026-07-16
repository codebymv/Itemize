/**
 * Organization-scoped saved contact segments.
 */
const express = require('express');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendError } = require('../utils/response');
const { contactColumns, segmentColumns, segmentHistoryColumns } = require('./segment-columns');
const {
    CONTACT_STATUSES,
    FILTER_OPERATORS,
    SegmentValidationError,
    compileSegmentCondition,
    normalizeSegmentDefinition,
    validateSegmentReferences,
} = require('../services/segmentFilter');

const parsePagination = (query) => {
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(page) || page < 1) throw new SegmentValidationError('page must be a positive integer', 'page');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new SegmentValidationError('limit must be an integer between 1 and 100', 'limit');
    }
    return { page, limit, offset: (page - 1) * limit };
};

const normalizeMetadata = (input, existing = {}) => {
    const name = input.name === undefined ? existing.name : input.name;
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 255) {
        throw new SegmentValidationError('name must be between 1 and 255 characters', 'name');
    }

    const description = input.description === undefined ? existing.description ?? null : input.description;
    if (description !== null && (typeof description !== 'string' || description.length > 5000)) {
        throw new SegmentValidationError('description must be null or at most 5000 characters', 'description');
    }

    const color = input.color ?? existing.color ?? '#6366F1';
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
        throw new SegmentValidationError('color must be a six-digit hex color', 'color');
    }

    const icon = input.icon ?? existing.icon ?? 'users';
    if (typeof icon !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(icon)) {
        throw new SegmentValidationError('icon is invalid', 'icon');
    }

    const isActive = input.is_active ?? existing.is_active ?? true;
    if (typeof isActive !== 'boolean') throw new SegmentValidationError('is_active must be boolean', 'is_active');

    return { name: name.trim(), description, color, icon, is_active: isActive };
};

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    const respondError = (res, error, fallback) => {
        if (error instanceof SegmentValidationError) {
            return res.status(400).json({ error: error.message, field: error.field });
        }
        console.error(fallback, error);
        return sendError(res, fallback);
    };

    const calculateSegmentCount = async (client, segment) => {
        const { condition, params } = compileSegmentCondition(segment, { startIndex: 2 });
        const result = await client.query(
            `SELECT COUNT(*)::int AS total
             FROM contacts c
             WHERE c.organization_id = $1 AND ${condition}`,
            [segment.organization_id, ...params]
        );
        const newCount = Number(result.rows[0].total);
        const previousCount = Number(segment.contact_count || 0);

        await client.query(
            `UPDATE segments
             SET contact_count = $1, last_calculated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND organization_id = $3`,
            [newCount, segment.id, segment.organization_id]
        );
        await client.query(
            `INSERT INTO segment_history
                (segment_id, organization_id, contact_count, contacts_added, contacts_removed)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                segment.id,
                segment.organization_id,
                newCount,
                Math.max(0, newCount - previousCount),
                Math.max(0, previousCount - newCount),
            ]
        );
        return newCount;
    };

    // This literal route must precede /:id.
    router.get('/filter-options', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const options = await withDbClient(pool, async (client) => {
                const tags = await client.query(
                    'SELECT id, name, color FROM tags WHERE organization_id = $1 ORDER BY name',
                    [req.organizationId]
                );
                const users = await client.query(
                    `SELECT u.id, u.name FROM users u
                     JOIN organization_members om ON om.user_id = u.id
                     WHERE om.organization_id = $1 ORDER BY u.name`,
                    [req.organizationId]
                );
                const pipelines = await client.query(
                    `SELECT id, name, stages FROM pipelines
                     WHERE organization_id = $1 ORDER BY is_default DESC, name`,
                    [req.organizationId]
                );
                return { tags: tags.rows, users: users.rows, pipelines: pipelines.rows };
            });

            res.json({
                fields: [
                    { id: 'status', label: 'Status', type: 'select', operators: FILTER_OPERATORS.status, options: CONTACT_STATUSES },
                    { id: 'source', label: 'Source', type: 'text', operators: FILTER_OPERATORS.source },
                    { id: 'email', label: 'Email', type: 'text', operators: FILTER_OPERATORS.email },
                    { id: 'phone', label: 'Phone', type: 'text', operators: FILTER_OPERATORS.phone },
                    { id: 'tags', label: 'Tags', type: 'tags', operators: FILTER_OPERATORS.tags },
                    { id: 'created_at', label: 'Created Date', type: 'date', operators: FILTER_OPERATORS.created_at },
                    { id: 'last_activity', label: 'Last Activity', type: 'number', operators: FILTER_OPERATORS.last_activity },
                    { id: 'email_engagement', label: 'Email Engagement', type: 'select', operators: FILTER_OPERATORS.email_engagement },
                    { id: 'email_unsubscribed', label: 'Unsubscribed', type: 'boolean', operators: FILTER_OPERATORS.email_unsubscribed },
                    { id: 'assigned_to', label: 'Assigned To', type: 'user', operators: FILTER_OPERATORS.assigned_to },
                    { id: 'deal_stage', label: 'Deal Stage', type: 'stage', operators: FILTER_OPERATORS.deal_stage },
                    { id: 'booking', label: 'Booking', type: 'select', operators: FILTER_OPERATORS.booking },
                    { id: 'custom_field', label: 'Custom Field', type: 'custom', operators: FILTER_OPERATORS.custom_field },
                ],
                tags: options.tags,
                users: options.users,
                pipelines: options.pipelines.map(pipeline => ({
                    id: pipeline.id,
                    name: pipeline.name,
                    stages: Array.isArray(pipeline.stages) ? pipeline.stages : [],
                })),
            });
        } catch (error) {
            return respondError(res, error, 'Failed to fetch filter options');
        }
    });

    router.post('/preview', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const definition = normalizeSegmentDefinition({
                segment_type: 'dynamic',
                filter_type: req.body.filter_type,
                filters: req.body.filters,
            });
            const result = await withDbClient(pool, async (client) => {
                await validateSegmentReferences(client, req.organizationId, definition);
                const { condition, params } = compileSegmentCondition(definition, { startIndex: 2 });
                const queryParams = [req.organizationId, ...params];
                const count = await client.query(
                    `SELECT COUNT(*)::int AS total FROM contacts c
                     WHERE c.organization_id = $1 AND ${condition}`,
                    queryParams
                );
                const sample = await client.query(
                    `SELECT c.id, c.first_name, c.last_name, c.email, c.status
                     FROM contacts c
                     WHERE c.organization_id = $1 AND ${condition}
                     ORDER BY c.created_at DESC, c.id DESC LIMIT 5`,
                    queryParams
                );
                return { count: count.rows[0].total, sample: sample.rows };
            });
            res.json(result);
        } catch (error) {
            return respondError(res, error, 'Failed to preview segment');
        }
    });

    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { is_active, search } = req.query;
            if (is_active !== undefined && !['true', 'false'].includes(is_active)) {
                throw new SegmentValidationError('is_active must be true or false', 'is_active');
            }
            if (search !== undefined && (typeof search !== 'string' || search.length > 200)) {
                throw new SegmentValidationError('search must be at most 200 characters', 'search');
            }

            let query = `SELECT ${segmentColumns('s')}, u.name AS created_by_name
                FROM segments s LEFT JOIN users u ON u.id = s.created_by
                WHERE s.organization_id = $1`;
            const params = [req.organizationId];
            if (is_active !== undefined) {
                params.push(is_active === 'true');
                query += ` AND s.is_active = $${params.length}`;
            }
            if (search) {
                params.push(`%${search}%`);
                query += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`;
            }
            query += ' ORDER BY s.name ASC, s.id ASC';
            const result = await withDbClient(pool, client => client.query(query, params));
            res.json(result.rows);
        } catch (error) {
            return respondError(res, error, 'Failed to fetch segments');
        }
    });

    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const metadata = normalizeMetadata(req.body);
            const definition = normalizeSegmentDefinition(req.body);
            const segment = await withTransaction(pool, async (client) => {
                await validateSegmentReferences(client, req.organizationId, definition);
                const inserted = await client.query(
                    `INSERT INTO segments
                        (organization_id, name, description, color, icon, filter_type, filters,
                         segment_type, static_contact_ids, is_active, created_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::int[], $10, $11)
                     RETURNING ${segmentColumns()}`,
                    [
                        req.organizationId, metadata.name, metadata.description, metadata.color, metadata.icon,
                        definition.filter_type, JSON.stringify(definition.filters), definition.segment_type,
                        definition.static_contact_ids, metadata.is_active, req.user.id,
                    ]
                );
                await calculateSegmentCount(client, inserted.rows[0]);
                return (await client.query(
                    `SELECT ${segmentColumns()} FROM segments WHERE id = $1 AND organization_id = $2`,
                    [inserted.rows[0].id, req.organizationId]
                )).rows[0];
            });
            res.status(201).json(segment);
        } catch (error) {
            return respondError(res, error, 'Failed to create segment');
        }
    });

    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) throw new SegmentValidationError('id must be a positive integer', 'id');
            const data = await withDbClient(pool, async (client) => {
                const segment = await client.query(
                    `SELECT ${segmentColumns('s')}, u.name AS created_by_name
                     FROM segments s LEFT JOIN users u ON u.id = s.created_by
                     WHERE s.id = $1 AND s.organization_id = $2`,
                    [id, req.organizationId]
                );
                if (segment.rows.length === 0) return null;
                const history = await client.query(
                    `SELECT ${segmentHistoryColumns()} FROM segment_history
                     WHERE segment_id = $1 AND organization_id = $2
                     ORDER BY calculated_at DESC, id DESC LIMIT 30`,
                    [id, req.organizationId]
                );
                return { ...segment.rows[0], history: history.rows };
            });
            if (!data) return res.status(404).json({ error: 'Segment not found' });
            res.json(data);
        } catch (error) {
            return respondError(res, error, 'Failed to fetch segment');
        }
    });

    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) throw new SegmentValidationError('id must be a positive integer', 'id');
            const segment = await withTransaction(pool, async (client) => {
                const currentResult = await client.query(
                    `SELECT ${segmentColumns()} FROM segments
                     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
                    [id, req.organizationId]
                );
                if (currentResult.rows.length === 0) return null;
                const current = currentResult.rows[0];
                const metadata = normalizeMetadata(req.body, current);
                const definition = normalizeSegmentDefinition(req.body, current);
                await validateSegmentReferences(client, req.organizationId, definition);
                const targetingChanged = JSON.stringify({
                    filter_type: current.filter_type,
                    filters: current.filters,
                    segment_type: current.segment_type,
                    static_contact_ids: current.static_contact_ids,
                }) !== JSON.stringify(definition);

                const updated = await client.query(
                    `UPDATE segments SET
                        name = $1, description = $2, color = $3, icon = $4,
                        filter_type = $5, filters = $6::jsonb, segment_type = $7,
                        static_contact_ids = $8::int[], is_active = $9, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $10 AND organization_id = $11
                     RETURNING ${segmentColumns()}`,
                    [
                        metadata.name, metadata.description, metadata.color, metadata.icon,
                        definition.filter_type, JSON.stringify(definition.filters), definition.segment_type,
                        definition.static_contact_ids, metadata.is_active, id, req.organizationId,
                    ]
                );
                if (targetingChanged) await calculateSegmentCount(client, updated.rows[0]);
                return (await client.query(
                    `SELECT ${segmentColumns()} FROM segments WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                )).rows[0];
            });
            if (!segment) return res.status(404).json({ error: 'Segment not found' });
            res.json(segment);
        } catch (error) {
            return respondError(res, error, 'Failed to update segment');
        }
    });

    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) throw new SegmentValidationError('id must be a positive integer', 'id');
            const outcome = await withTransaction(pool, async (client) => {
                const segment = await client.query(
                    'SELECT id FROM segments WHERE id = $1 AND organization_id = $2 FOR UPDATE',
                    [id, req.organizationId]
                );
                if (segment.rows.length === 0) return 'not_found';
                const campaign = await client.query(
                    `SELECT 1 FROM email_campaigns
                     WHERE segment_id = $1 AND organization_id = $2 LIMIT 1`,
                    [id, req.organizationId]
                );
                if (campaign.rows.length > 0) return 'in_use';
                await client.query('DELETE FROM segments WHERE id = $1 AND organization_id = $2', [id, req.organizationId]);
                return 'deleted';
            });
            if (outcome === 'not_found') return res.status(404).json({ error: 'Segment not found' });
            if (outcome === 'in_use') return res.status(409).json({ error: 'Segment is used by an active campaign' });
            res.json({ success: true });
        } catch (error) {
            return respondError(res, error, 'Failed to delete segment');
        }
    });

    router.post('/:id/calculate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) throw new SegmentValidationError('id must be a positive integer', 'id');
            const segment = await withTransaction(pool, async (client) => {
                const current = await client.query(
                    `SELECT ${segmentColumns()} FROM segments
                     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
                    [id, req.organizationId]
                );
                if (current.rows.length === 0) return null;
                const definition = normalizeSegmentDefinition(current.rows[0]);
                await validateSegmentReferences(client, req.organizationId, definition);
                await calculateSegmentCount(client, current.rows[0]);
                return (await client.query(
                    `SELECT ${segmentColumns()} FROM segments WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                )).rows[0];
            });
            if (!segment) return res.status(404).json({ error: 'Segment not found' });
            res.json(segment);
        } catch (error) {
            return respondError(res, error, 'Failed to calculate segment');
        }
    });

    router.get('/:id/contacts', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) throw new SegmentValidationError('id must be a positive integer', 'id');
            const pagination = parsePagination(req.query);
            const data = await withDbClient(pool, async (client) => {
                const segmentResult = await client.query(
                    `SELECT ${segmentColumns()} FROM segments WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );
                if (segmentResult.rows.length === 0) return null;
                const { condition, params } = compileSegmentCondition(segmentResult.rows[0], { startIndex: 2 });
                const baseParams = [req.organizationId, ...params];
                const count = await client.query(
                    `SELECT COUNT(*)::int AS total FROM contacts c
                     WHERE c.organization_id = $1 AND ${condition}`,
                    baseParams
                );
                const contacts = await client.query(
                    `SELECT ${contactColumns('c')} FROM contacts c
                     WHERE c.organization_id = $1 AND ${condition}
                     ORDER BY c.created_at DESC, c.id DESC
                     LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
                    [...baseParams, pagination.limit, pagination.offset]
                );
                return { contacts: contacts.rows, total: count.rows[0].total };
            });
            if (!data) return res.status(404).json({ error: 'Segment not found' });
            res.json({
                contacts: data.contacts,
                pagination: {
                    page: pagination.page,
                    limit: pagination.limit,
                    total: data.total,
                    totalPages: Math.ceil(data.total / pagination.limit),
                },
            });
        } catch (error) {
            return respondError(res, error, 'Failed to fetch segment contacts');
        }
    });

    return router;
};
