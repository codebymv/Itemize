const express = require('express');
const { logger } = require('../../utils/logger');
const { withDbClient, withTransaction } = require('../../utils/db');
const UsageTrackingService = require('../../services/usageTrackingService');
const { ERROR_CODES } = require('../../lib/subscription.constants');
const { checkLandingPageLimit, generateSlug } = require('./helpers');
const { pageColumns, pageSectionColumns, PAGE_SECTION_UNNEST_COLUMNS } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();
    const usageService = new UsageTrackingService(pool);

// Page CRUD
    // ======================

    /**
     * GET /api/pages - List pages
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, search, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE p.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND p.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.slug ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const result = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM pages p ${whereClause}`,
                    params
                );

                const pagesResult = await client.query(`
                    SELECT ${pageColumns('p')}, 
                           u.name as created_by_name,
                           (SELECT COUNT(*) FROM page_sections WHERE page_id = p.id) as section_count
                    FROM pages p
                    LEFT JOIN users u ON p.created_by = u.id
                    ${whereClause}
                    ORDER BY p.updated_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return { pages: pagesResult.rows, total: parseInt(countResult.rows[0].count) };
            });

            res.json({
                pages: result.pages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    totalPages: Math.ceil(result.total / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error('Error fetching pages', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch pages' });
        }
    });

    /**
     * GET /api/pages/:id - Get page with sections
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const pageResult = await client.query(`
                    SELECT ${pageColumns('p')}, u.name as created_by_name
                    FROM pages p
                    LEFT JOIN users u ON p.created_by = u.id
                    WHERE p.id = $1 AND p.organization_id = $2
                `, [id, req.organizationId]);

                if (pageResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const sectionsResult = await client.query(`
                    SELECT ${pageSectionColumns()} FROM page_sections
                    WHERE page_id = $1
                    ORDER BY section_order ASC
                `, [id]);

                const page = pageResult.rows[0];
                page.sections = sectionsResult.rows;
                return { status: 'ok', page };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json(result.page);
        } catch (error) {
            logger.error('Error fetching page', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch page' });
        }
    });

    /**
     * POST /api/pages - Create page
     * Usage limited: landing_pages count
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            // Check landing page limit
            const limitCheck = await checkLandingPageLimit(pool, req.organizationId);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: {
                        message: `You've reached your landing page limit (${limitCheck.current}/${limitCheck.limit}). Please upgrade your plan.`,
                        code: ERROR_CODES.PLAN_LIMIT_REACHED,
                        resourceType: 'landing_pages',
                        current: limitCheck.current,
                        limit: limitCheck.limit,
                        plan: limitCheck.plan
                    }
                });
            }

            const {
                name,
                description,
                slug: customSlug,
                theme,
                settings,
                seo_title,
                seo_description,
                seo_keywords,
                og_image,
                sections
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const page = await withTransaction(pool, async (client) => {
                // Generate slug
                const slug = customSlug || await generateSlug(client, req.organizationId, name);

                // Create page
                const pageResult = await client.query(`
                    INSERT INTO pages (
                        organization_id, name, description, slug, theme, settings,
                        seo_title, seo_description, seo_keywords, og_image, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING ${pageColumns()}
                `, [
                    req.organizationId,
                    name,
                    description || null,
                    slug,
                    theme ? JSON.stringify(theme) : null,
                    settings ? JSON.stringify(settings) : null,
                    seo_title || null,
                    seo_description || null,
                    seo_keywords || null,
                    og_image || null,
                    req.user.id
                ]);

                const createdPage = pageResult.rows[0];

                // Create sections if provided
                if (sections && Array.isArray(sections) && sections.length > 0) {
                    await client.query(`
                        INSERT INTO page_sections (
                            page_id, organization_id, section_type, name, content, settings, section_order
                        )
                        SELECT ${PAGE_SECTION_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::int[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::jsonb[], $7::int[]
                        ) AS u(${PAGE_SECTION_UNNEST_COLUMNS})
                    `, [
                        sections.map(() => createdPage.id),
                        sections.map(() => req.organizationId),
                        sections.map(s => s.section_type),
                        sections.map(s => s.name || null),
                        sections.map(s => JSON.stringify(s.content || {})),
                        sections.map(s => JSON.stringify(s.settings || {})),
                        sections.map((_, i) => i)
                    ]);
                }

                // Fetch complete page with sections
                const sectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [createdPage.id]
                );
                createdPage.sections = sectionsResult.rows;

                return createdPage;
            });

            // Track usage
            await usageService.incrementUsage(req.organizationId, 'landing_pages');

            res.status(201).json(page);
        } catch (error) {
            console.error('Error creating page:', error);
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Slug already exists' });
            }
            res.status(500).json({ error: 'Failed to create page' });
        }
    });

    /**
     * PUT /api/pages/:id - Update page
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                description,
                slug,
                status,
                theme,
                settings,
                seo_title,
                seo_description,
                seo_keywords,
                og_image,
                favicon_url,
                custom_css,
                custom_js,
                custom_head
            } = req.body;

            const result = await withDbClient(pool, async (client) => {
                // Build update query dynamically
                const updates = [];
                const params = [];
                let paramIndex = 1;

                if (name !== undefined) {
                    updates.push(`name = $${paramIndex++}`);
                    params.push(name);
                }
                if (description !== undefined) {
                    updates.push(`description = $${paramIndex++}`);
                    params.push(description);
                }
                if (slug !== undefined) {
                    // Validate slug uniqueness
                    const slugCheck = await client.query(
                        'SELECT id FROM pages WHERE organization_id = $1 AND slug = $2 AND id != $3',
                        [req.organizationId, slug, id]
                    );
                    if (slugCheck.rows.length > 0) {
                        return { status: 'slug_exists' };
                    }
                    updates.push(`slug = $${paramIndex++}`);
                    params.push(slug);
                }
                if (status !== undefined) {
                    updates.push(`status = $${paramIndex++}`);
                    params.push(status);
                    if (status === 'published') {
                        updates.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
                    }
                }
                if (theme !== undefined) {
                    updates.push(`theme = $${paramIndex++}`);
                    params.push(JSON.stringify(theme));
                }
                if (settings !== undefined) {
                    updates.push(`settings = $${paramIndex++}`);
                    params.push(JSON.stringify(settings));
                }
                if (seo_title !== undefined) {
                    updates.push(`seo_title = $${paramIndex++}`);
                    params.push(seo_title);
                }
                if (seo_description !== undefined) {
                    updates.push(`seo_description = $${paramIndex++}`);
                    params.push(seo_description);
                }
                if (seo_keywords !== undefined) {
                    updates.push(`seo_keywords = $${paramIndex++}`);
                    params.push(seo_keywords);
                }
                if (og_image !== undefined) {
                    updates.push(`og_image = $${paramIndex++}`);
                    params.push(og_image);
                }
                if (favicon_url !== undefined) {
                    updates.push(`favicon_url = $${paramIndex++}`);
                    params.push(favicon_url);
                }
                if (custom_css !== undefined) {
                    updates.push(`custom_css = $${paramIndex++}`);
                    params.push(custom_css);
                }
                if (custom_js !== undefined) {
                    updates.push(`custom_js = $${paramIndex++}`);
                    params.push(custom_js);
                }
                if (custom_head !== undefined) {
                    updates.push(`custom_head = $${paramIndex++}`);
                    params.push(custom_head);
                }

                updates.push('updated_at = CURRENT_TIMESTAMP');
                params.push(id, req.organizationId);

                const updateResult = await client.query(`
                    UPDATE pages SET ${updates.join(', ')}
                    WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                    RETURNING ${pageColumns()}
                `, params);

                if (updateResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const sectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [id]
                );

                const page = updateResult.rows[0];
                page.sections = sectionsResult.rows;
                return { status: 'ok', page };
            });

            if (result.status === 'slug_exists') {
                return res.status(400).json({ error: 'Slug already exists' });
            }
            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json(result.page);
        } catch (error) {
            logger.error('Error updating page', { error: error.message });
            res.status(500).json({ error: 'Failed to update page' });
        }
    });

    /**
     * DELETE /api/pages/:id - Delete page
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM pages WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting page:', error);
            res.status(500).json({ error: 'Failed to delete page' });
        }
    });

    /**
     * POST /api/pages/:id/duplicate - Duplicate page
     */
    router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withTransaction(pool, async (client) => {
                // Get original page
                const originalResult = await client.query(
                    `SELECT ${pageColumns()} FROM pages WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (originalResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const original = originalResult.rows[0];

                // Generate new slug
                const newSlug = await generateSlug(client, req.organizationId, `${original.name} Copy`);

                // Create duplicate
                const newPageResult = await client.query(`
                    INSERT INTO pages (
                        organization_id, name, description, slug, status, theme, settings,
                        seo_title, seo_description, seo_keywords, og_image, favicon_url,
                        custom_css, custom_js, custom_head, created_by
                    ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING ${pageColumns()}
                `, [
                    req.organizationId,
                    `${original.name} Copy`,
                    original.description,
                    newSlug,
                    JSON.stringify(original.theme),
                    JSON.stringify(original.settings),
                    original.seo_title,
                    original.seo_description,
                    original.seo_keywords,
                    original.og_image,
                    original.favicon_url,
                    original.custom_css,
                    original.custom_js,
                    original.custom_head,
                    req.user.id
                ]);

                const newPage = newPageResult.rows[0];

                // Duplicate sections
                const sectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [id]
                );

                if (sectionsResult.rows.length > 0) {
                    await client.query(`
                        INSERT INTO page_sections (
                            page_id, organization_id, section_type, name, content, settings, section_order
                        )
                        SELECT ${PAGE_SECTION_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::int[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::jsonb[], $7::int[]
                        ) AS u(${PAGE_SECTION_UNNEST_COLUMNS})
                    `, [
                        sectionsResult.rows.map(() => newPage.id),
                        sectionsResult.rows.map(() => req.organizationId),
                        sectionsResult.rows.map(s => s.section_type),
                        sectionsResult.rows.map(s => s.name),
                        sectionsResult.rows.map(s => JSON.stringify(s.content)),
                        sectionsResult.rows.map(s => JSON.stringify(s.settings)),
                        sectionsResult.rows.map(s => s.section_order)
                    ]);
                }
                const newSectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [newPage.id]
                );

                newPage.sections = newSectionsResult.rows;
                return { status: 'ok', page: newPage };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.status(201).json(result.page);
        } catch (error) {
            logger.error('Error duplicating page', { error: error.message });
            res.status(500).json({ error: 'Failed to duplicate page' });
        }
    });

    // ======================

    return router;
};
