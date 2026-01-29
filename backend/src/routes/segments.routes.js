/**
 * Segments Routes
 * CRUD operations and dynamic segment filtering
 */

const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');

module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Build SQL WHERE clause from segment filters
     * Supports: status, tags, source, custom_fields, date ranges, email engagement
     */
    function buildFilterQuery(filters, filterType = 'and') {
        if (!filters || !Array.isArray(filters) || filters.length === 0) {
            return { whereClause: '', params: [], paramIndex: 1 };
        }

        const conditions = [];
        const params = [];
        let paramIndex = 1;

        for (const filter of filters) {
            const { field, operator, value } = filter;
            if (!field || !operator) continue;

            let condition = '';

            switch (field) {
                case 'status':
                    if (operator === 'equals') {
                        condition = `c.status = $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'not_equals') {
                        condition = `c.status != $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'in') {
                        condition = `c.status = ANY($${paramIndex})`;
                        params.push(value);
                        paramIndex++;
                    }
                    break;

                case 'source':
                    if (operator === 'equals') {
                        condition = `c.source = $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'contains') {
                        condition = `c.source ILIKE $${paramIndex}`;
                        params.push(`%${value}%`);
                        paramIndex++;
                    } else if (operator === 'is_empty') {
                        condition = `(c.source IS NULL OR c.source = '')`;
                    } else if (operator === 'is_not_empty') {
                        condition = `(c.source IS NOT NULL AND c.source != '')`;
                    }
                    break;

                case 'email':
                    if (operator === 'contains') {
                        condition = `c.email ILIKE $${paramIndex}`;
                        params.push(`%${value}%`);
                        paramIndex++;
                    } else if (operator === 'ends_with') {
                        condition = `c.email ILIKE $${paramIndex}`;
                        params.push(`%${value}`);
                        paramIndex++;
                    } else if (operator === 'is_empty') {
                        condition = `(c.email IS NULL OR c.email = '')`;
                    } else if (operator === 'is_not_empty') {
                        condition = `(c.email IS NOT NULL AND c.email != '')`;
                    }
                    break;

                case 'phone':
                    if (operator === 'is_empty') {
                        condition = `(c.phone IS NULL OR c.phone = '')`;
                    } else if (operator === 'is_not_empty') {
                        condition = `(c.phone IS NOT NULL AND c.phone != '')`;
                    } else if (operator === 'contains') {
                        condition = `c.phone ILIKE $${paramIndex}`;
                        params.push(`%${value}%`);
                        paramIndex++;
                    }
                    break;

                case 'tags':
                    if (operator === 'has_any') {
                        condition = `c.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${paramIndex}))`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'has_all') {
                        // Contact must have ALL specified tags
                        const tagCount = Array.isArray(value) ? value.length : 1;
                        condition = `c.id IN (
                            SELECT contact_id FROM contact_tags 
                            WHERE tag_id = ANY($${paramIndex})
                            GROUP BY contact_id 
                            HAVING COUNT(DISTINCT tag_id) = ${tagCount}
                        )`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'has_none') {
                        condition = `c.id NOT IN (SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${paramIndex}))`;
                        params.push(value);
                        paramIndex++;
                    }
                    break;

                case 'created_at':
                    if (operator === 'after') {
                        condition = `c.created_at >= $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'before') {
                        condition = `c.created_at <= $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'between') {
                        condition = `c.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
                        params.push(value.start, value.end);
                        paramIndex += 2;
                    } else if (operator === 'last_n_days') {
                        condition = `c.created_at >= NOW() - INTERVAL '${parseInt(value)} days'`;
                    }
                    break;

                case 'last_activity':
                    if (operator === 'last_n_days') {
                        condition = `c.id IN (
                            SELECT contact_id FROM contact_activities 
                            WHERE created_at >= NOW() - INTERVAL '${parseInt(value)} days'
                        )`;
                    } else if (operator === 'no_activity_days') {
                        condition = `c.id NOT IN (
                            SELECT contact_id FROM contact_activities 
                            WHERE created_at >= NOW() - INTERVAL '${parseInt(value)} days'
                        )`;
                    }
                    break;

                case 'email_engagement':
                    if (operator === 'opened_campaign') {
                        condition = `c.id IN (
                            SELECT contact_id FROM campaign_recipients 
                            WHERE status IN ('opened', 'clicked') AND opened_at IS NOT NULL
                        )`;
                    } else if (operator === 'never_opened') {
                        condition = `c.id NOT IN (
                            SELECT contact_id FROM campaign_recipients 
                            WHERE status IN ('opened', 'clicked') AND opened_at IS NOT NULL
                        )`;
                    } else if (operator === 'clicked_link') {
                        condition = `c.id IN (
                            SELECT contact_id FROM campaign_recipients 
                            WHERE status = 'clicked' AND clicked_at IS NOT NULL
                        )`;
                    }
                    break;

                case 'email_unsubscribed':
                    if (operator === 'equals') {
                        condition = `COALESCE(c.email_unsubscribed, FALSE) = $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    }
                    break;

                case 'assigned_to':
                    if (operator === 'equals') {
                        condition = `c.assigned_to = $${paramIndex}`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'is_empty') {
                        condition = `c.assigned_to IS NULL`;
                    } else if (operator === 'is_not_empty') {
                        condition = `c.assigned_to IS NOT NULL`;
                    }
                    break;

                case 'custom_field':
                    // Custom field queries against JSONB
                    if (filter.custom_field_key) {
                        const key = filter.custom_field_key;
                        if (operator === 'equals') {
                            condition = `c.custom_fields->>'${key}' = $${paramIndex}`;
                            params.push(value);
                            paramIndex++;
                        } else if (operator === 'contains') {
                            condition = `c.custom_fields->>'${key}' ILIKE $${paramIndex}`;
                            params.push(`%${value}%`);
                            paramIndex++;
                        } else if (operator === 'is_empty') {
                            condition = `(c.custom_fields->>'${key}' IS NULL OR c.custom_fields->>'${key}' = '')`;
                        } else if (operator === 'is_not_empty') {
                            condition = `(c.custom_fields->>'${key}' IS NOT NULL AND c.custom_fields->>'${key}' != '')`;
                        }
                    }
                    break;

                case 'deal_stage':
                    if (operator === 'in_stage') {
                        condition = `c.id IN (
                            SELECT contact_id FROM deals 
                            WHERE stage_id = $${paramIndex} AND won_at IS NULL AND lost_at IS NULL
                        )`;
                        params.push(value);
                        paramIndex++;
                    } else if (operator === 'has_open_deal') {
                        condition = `c.id IN (
                            SELECT contact_id FROM deals 
                            WHERE won_at IS NULL AND lost_at IS NULL
                        )`;
                    } else if (operator === 'won_deal') {
                        condition = `c.id IN (SELECT contact_id FROM deals WHERE won_at IS NOT NULL)`;
                    } else if (operator === 'lost_deal') {
                        condition = `c.id IN (SELECT contact_id FROM deals WHERE lost_at IS NOT NULL)`;
                    }
                    break;

                case 'booking':
                    if (operator === 'has_upcoming') {
                        condition = `c.id IN (
                            SELECT contact_id FROM bookings 
                            WHERE start_time > NOW() AND status IN ('confirmed', 'pending')
                        )`;
                    } else if (operator === 'completed') {
                        condition = `c.id IN (
                            SELECT contact_id FROM bookings WHERE status = 'completed'
                        )`;
                    } else if (operator === 'no_show') {
                        condition = `c.id IN (
                            SELECT contact_id FROM bookings WHERE status = 'no_show'
                        )`;
                    }
                    break;

                default:
                    // Skip unknown fields
                    continue;
            }

            if (condition) {
                conditions.push(condition);
            }
        }

        if (conditions.length === 0) {
            return { whereClause: '', params: [], paramIndex: 1 };
        }

        const joinOperator = filterType === 'or' ? ' OR ' : ' AND ';
        const whereClause = `(${conditions.join(joinOperator)})`;

        return { whereClause, params, paramIndex };
    }

    // ======================
    // Segment CRUD
    // ======================

    /**
     * GET /api/segments - List all segments
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { is_active, search } = req.query;
            let query = `
                SELECT s.*, u.name as created_by_name
                FROM segments s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.organization_id = $1
            `;
            const params = [req.organizationId];
            let paramIndex = 2;

            if (is_active !== undefined) {
                query += ` AND s.is_active = $${paramIndex}`;
                params.push(is_active === 'true');
                paramIndex++;
            }

            if (search) {
                query += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            query += ' ORDER BY s.name ASC';

            const result = await withDbClient(pool, async (client) => client.query(query, params));

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching segments:', error);
            return sendError(res, 'Failed to fetch segments');
        }
    });

    /**
     * GET /api/segments/:id - Get segment details
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const result = await client.query(`
                    SELECT s.*, u.name as created_by_name
                    FROM segments s
                    LEFT JOIN users u ON s.created_by = u.id
                    WHERE s.id = $1 AND s.organization_id = $2
                `, [id, req.organizationId]);

                if (result.rows.length === 0) {
                    return { status: 404, error: 'Segment not found' };
                }

                // Get recent history
                const historyResult = await client.query(`
                    SELECT * FROM segment_history 
                    WHERE segment_id = $1 
                    ORDER BY calculated_at DESC 
                    LIMIT 30
                `, [id]);

                return { status: 200, segment: result.rows[0], history: historyResult.rows };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            data.segment.history = data.history;

            res.json(data.segment);
        } catch (error) {
            console.error('Error fetching segment:', error);
            return sendError(res, 'Failed to fetch segment');
        }
    });

    /**
     * POST /api/segments - Create segment
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                description,
                color,
                icon,
                filter_type,
                filters,
                segment_type,
                static_contact_ids
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            if (!filters || !Array.isArray(filters) || filters.length === 0) {
                return res.status(400).json({ error: 'At least one filter is required' });
            }

            const segment = await withDbClient(pool, async (client) => {
                const result = await client.query(`
                    INSERT INTO segments (
                        organization_id, name, description, color, icon,
                        filter_type, filters, segment_type, static_contact_ids,
                        created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING *
                `, [
                    req.organizationId,
                    name,
                    description || null,
                    color || '#6366F1',
                    icon || 'users',
                    filter_type || 'and',
                    JSON.stringify(filters),
                    segment_type || 'dynamic',
                    static_contact_ids || [],
                    req.user.id
                ]);

                // Calculate initial contact count
                const segment = result.rows[0];
                await calculateSegmentCount(client, segment);

                return segment;
            });

            res.status(201).json(segment);
        } catch (error) {
            console.error('Error creating segment:', error);
            return sendError(res, 'Failed to create segment');
        }
    });

    /**
     * PUT /api/segments/:id - Update segment
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                description,
                color,
                icon,
                filter_type,
                filters,
                is_active
            } = req.body;

            const data = await withDbClient(pool, async (client) => {
                const result = await client.query(`
                    UPDATE segments SET
                        name = COALESCE($1, name),
                        description = $2,
                        color = COALESCE($3, color),
                        icon = COALESCE($4, icon),
                        filter_type = COALESCE($5, filter_type),
                        filters = COALESCE($6, filters),
                        is_active = COALESCE($7, is_active),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $8 AND organization_id = $9
                    RETURNING *
                `, [
                    name,
                    description,
                    color,
                    icon,
                    filter_type,
                    filters ? JSON.stringify(filters) : null,
                    is_active,
                    id,
                    req.organizationId
                ]);

                if (result.rows.length === 0) {
                    return { status: 404, error: 'Segment not found' };
                }

                // Recalculate contact count if filters changed
                if (filters) {
                    await calculateSegmentCount(client, result.rows[0]);
                }

                return { status: 200, segment: result.rows[0] };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json(data.segment);
        } catch (error) {
            console.error('Error updating segment:', error);
            return sendError(res, 'Failed to update segment');
        }
    });

    /**
     * DELETE /api/segments/:id - Delete segment
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'DELETE FROM segments WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Segment not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting segment:', error);
            return sendError(res, 'Failed to delete segment');
        }
    });

    // ======================
    // Segment Actions
    // ======================

    /**
     * POST /api/segments/:id/calculate - Recalculate segment count
     */
    router.post('/:id/calculate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const segmentResult = await client.query(
                    'SELECT * FROM segments WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (segmentResult.rows.length === 0) {
                    return { status: 404, error: 'Segment not found' };
                }

                const segment = segmentResult.rows[0];
                await calculateSegmentCount(client, segment);

                // Get updated segment
                const updatedResult = await client.query(
                    'SELECT * FROM segments WHERE id = $1',
                    [id]
                );

                return { status: 200, segment: updatedResult.rows[0] };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json(data.segment);
        } catch (error) {
            console.error('Error calculating segment:', error);
            return sendError(res, 'Failed to calculate segment');
        }
    });

    /**
     * GET /api/segments/:id/contacts - Get contacts in segment
     */
    router.get('/:id/contacts', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const data = await withDbClient(pool, async (client) => {
                // Get segment
                const segmentResult = await client.query(
                    'SELECT * FROM segments WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (segmentResult.rows.length === 0) {
                    return { status: 404, error: 'Segment not found' };
                }

                const segment = segmentResult.rows[0];

                // Build filter query
                const { whereClause, params } = buildFilterQuery(segment.filters, segment.filter_type);

                let baseQuery = `
                    SELECT c.* FROM contacts c
                    WHERE c.organization_id = $1
                `;
                const queryParams = [req.organizationId];

                if (whereClause) {
                    // Adjust param indices
                    const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => {
                        return `$${parseInt(num) + 1}`;
                    });
                    baseQuery += ` AND ${adjustedWhereClause}`;
                    queryParams.push(...params);
                }

                // Count query
                const countQuery = baseQuery.replace('SELECT c.*', 'SELECT COUNT(*)');
                const countResult = await client.query(countQuery, queryParams);

                // Data query with pagination
                baseQuery += ` ORDER BY c.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
                queryParams.push(parseInt(limit), offset);

                const contactsResult = await client.query(baseQuery, queryParams);

                return { status: 200, contactsResult, countResult };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            res.json({
                contacts: data.contactsResult.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(data.countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(data.countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching segment contacts:', error);
            return sendError(res, 'Failed to fetch segment contacts');
        }
    });

    /**
     * POST /api/segments/preview - Preview segment filter results
     */
    router.post('/preview', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { filters, filter_type } = req.body;

            if (!filters || !Array.isArray(filters)) {
                return res.status(400).json({ error: 'Filters array is required' });
            }

            const data = await withDbClient(pool, async (client) => {
                const { whereClause, params } = buildFilterQuery(filters, filter_type || 'and');

                let query = `
                    SELECT COUNT(*) as total FROM contacts c
                    WHERE c.organization_id = $1
                `;
                const queryParams = [req.organizationId];

                if (whereClause) {
                    const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => {
                        return `$${parseInt(num) + 1}`;
                    });
                    query += ` AND ${adjustedWhereClause}`;
                    queryParams.push(...params);
                }

                const result = await client.query(query, queryParams);

                // Get sample contacts
                let sampleQuery = `
                    SELECT c.id, c.first_name, c.last_name, c.email, c.status
                    FROM contacts c
                    WHERE c.organization_id = $1
                `;

                if (whereClause) {
                    const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => {
                        return `$${parseInt(num) + 1}`;
                    });
                    sampleQuery += ` AND ${adjustedWhereClause}`;
                }
                sampleQuery += ' LIMIT 5';

                const sampleResult = await client.query(sampleQuery, queryParams.slice(0, -0) || queryParams);

                return { result, sampleResult };
            });

            res.json({
                count: parseInt(data.result.rows[0].total),
                sample: data.sampleResult.rows
            });
        } catch (error) {
            console.error('Error previewing segment:', error);
            return sendError(res, 'Failed to preview segment');
        }
    });

    /**
     * GET /api/segments/filter-options - Get available filter options
     */
    router.get('/filter-options', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { tagsResult, usersResult, stagesResult } = await withDbClient(pool, async (client) => {
                // Get tags
                const tagsResult = await client.query(
                    'SELECT id, name, color FROM tags WHERE organization_id = $1 ORDER BY name',
                    [req.organizationId]
                );

                // Get users for assignment filter
                const usersResult = await client.query(`
                    SELECT u.id, u.name FROM users u
                    JOIN organization_members om ON u.id = om.user_id
                    WHERE om.organization_id = $1
                    ORDER BY u.name
                `, [req.organizationId]);

                // Get pipeline stages
                const stagesResult = await client.query(`
                    SELECT p.id as pipeline_id, p.name as pipeline_name, p.stages
                    FROM pipelines p
                    WHERE p.organization_id = $1
                    ORDER BY p.is_default DESC, p.name
                `, [req.organizationId]);

                return { tagsResult, usersResult, stagesResult };
            });

            res.json({
                fields: [
                    { id: 'status', label: 'Status', type: 'select', operators: ['equals', 'not_equals', 'in'], options: ['lead', 'active', 'customer', 'inactive'] },
                    { id: 'source', label: 'Source', type: 'text', operators: ['equals', 'contains', 'is_empty', 'is_not_empty'] },
                    { id: 'email', label: 'Email', type: 'text', operators: ['contains', 'ends_with', 'is_empty', 'is_not_empty'] },
                    { id: 'phone', label: 'Phone', type: 'text', operators: ['is_empty', 'is_not_empty', 'contains'] },
                    { id: 'tags', label: 'Tags', type: 'tags', operators: ['has_any', 'has_all', 'has_none'] },
                    { id: 'created_at', label: 'Created Date', type: 'date', operators: ['after', 'before', 'between', 'last_n_days'] },
                    { id: 'last_activity', label: 'Last Activity', type: 'number', operators: ['last_n_days', 'no_activity_days'] },
                    { id: 'email_engagement', label: 'Email Engagement', type: 'select', operators: ['opened_campaign', 'never_opened', 'clicked_link'] },
                    { id: 'email_unsubscribed', label: 'Unsubscribed', type: 'boolean', operators: ['equals'] },
                    { id: 'assigned_to', label: 'Assigned To', type: 'user', operators: ['equals', 'is_empty', 'is_not_empty'] },
                    { id: 'deal_stage', label: 'Deal Stage', type: 'stage', operators: ['in_stage', 'has_open_deal', 'won_deal', 'lost_deal'] },
                    { id: 'booking', label: 'Booking', type: 'select', operators: ['has_upcoming', 'completed', 'no_show'] },
                    { id: 'custom_field', label: 'Custom Field', type: 'custom', operators: ['equals', 'contains', 'is_empty', 'is_not_empty'] }
                ],
                tags: tagsResult.rows,
                users: usersResult.rows,
                pipelines: stagesResult.rows.map(p => ({
                    id: p.pipeline_id,
                    name: p.pipeline_name,
                    stages: p.stages || []
                }))
            });
        } catch (error) {
            console.error('Error fetching filter options:', error);
            return sendError(res, 'Failed to fetch filter options');
        }
    });

    /**
     * Helper: Calculate segment contact count and save history
     */
    async function calculateSegmentCount(client, segment) {
        try {
            const { whereClause, params } = buildFilterQuery(segment.filters, segment.filter_type);

            let query = `
                SELECT COUNT(*) as total FROM contacts c
                WHERE c.organization_id = $1
            `;
            const queryParams = [segment.organization_id];

            if (whereClause) {
                const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => {
                    return `$${parseInt(num) + 1}`;
                });
                query += ` AND ${adjustedWhereClause}`;
                queryParams.push(...params);
            }

            const result = await client.query(query, queryParams);
            const newCount = parseInt(result.rows[0].total);
            const previousCount = segment.contact_count || 0;

            // Update segment
            await client.query(`
                UPDATE segments SET
                    contact_count = $1,
                    last_calculated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newCount, segment.id]);

            // Record history
            await client.query(`
                INSERT INTO segment_history (segment_id, organization_id, contact_count, contacts_added, contacts_removed)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                segment.id,
                segment.organization_id,
                newCount,
                Math.max(0, newCount - previousCount),
                Math.max(0, previousCount - newCount)
            ]);

            return newCount;
        } catch (error) {
            console.error('Error calculating segment count:', error);
            return 0;
        }
    }

    return router;
};
