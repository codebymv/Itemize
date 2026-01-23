/**
 * Landing Pages Routes
 * CRUD operations, section management, and public page serving
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Password hashing configuration (Phase 1.2)
const SALT_ROUNDS = 10;

module.exports = (pool, authenticateJWT, publicRateLimit) => {

    // Use shared organization middleware (Phase 5.3)
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Generate unique slug from name
     */
    async function generateSlug(client, organizationId, name, excludeId = null) {
        const baseSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50);

        let slug = baseSlug || 'page';
        let counter = 0;

        while (true) {
            const checkSlug = counter === 0 ? slug : `${slug}-${counter}`;
            
            let query = 'SELECT id FROM pages WHERE organization_id = $1 AND slug = $2';
            const params = [organizationId, checkSlug];
            
            if (excludeId) {
                query += ' AND id != $3';
                params.push(excludeId);
            }

            const result = await client.query(query, params);
            
            if (result.rows.length === 0) {
                return checkSlug;
            }
            
            counter++;
        }
    }

    /**
     * Parse device info from user agent
     */
    function parseDeviceInfo(userAgent) {
        const ua = userAgent?.toLowerCase() || '';
        
        let deviceType = 'desktop';
        if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
            deviceType = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
        }

        let browser = 'unknown';
        if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
        else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
        else if (ua.includes('firefox')) browser = 'Firefox';
        else if (ua.includes('edg')) browser = 'Edge';
        else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

        let os = 'unknown';
        if (ua.includes('windows')) os = 'Windows';
        else if (ua.includes('mac')) os = 'macOS';
        else if (ua.includes('linux')) os = 'Linux';
        else if (ua.includes('android')) os = 'Android';
        else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

        return { deviceType, browser, os };
    }

    // ======================
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

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM pages p ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT p.*, 
                       u.name as created_by_name,
                       (SELECT COUNT(*) FROM page_sections WHERE page_id = p.id) as section_count
                FROM pages p
                LEFT JOIN users u ON p.created_by = u.id
                ${whereClause}
                ORDER BY p.updated_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                pages: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
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
            const client = await pool.connect();

            const pageResult = await client.query(`
                SELECT p.*, u.name as created_by_name
                FROM pages p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = $1 AND p.organization_id = $2
            `, [id, req.organizationId]);

            if (pageResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Page not found' });
            }

            // Get sections
            const sectionsResult = await client.query(`
                SELECT * FROM page_sections
                WHERE page_id = $1
                ORDER BY section_order ASC
            `, [id]);

            client.release();

            const page = pageResult.rows[0];
            page.sections = sectionsResult.rows;

            res.json(page);
        } catch (error) {
            logger.error('Error fetching page', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch page' });
        }
    });

    /**
     * POST /api/pages - Create page
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
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

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Generate slug
                const slug = customSlug || await generateSlug(client, req.organizationId, name);

                // Create page
                const pageResult = await client.query(`
                    INSERT INTO pages (
                        organization_id, name, description, slug, theme, settings,
                        seo_title, seo_description, seo_keywords, og_image, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *
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

                const page = pageResult.rows[0];

                // Create sections if provided
                if (sections && Array.isArray(sections) && sections.length > 0) {
                    for (let i = 0; i < sections.length; i++) {
                        const section = sections[i];
                        await client.query(`
                            INSERT INTO page_sections (
                                page_id, organization_id, section_type, name, content, settings, section_order
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [
                            page.id,
                            req.organizationId,
                            section.section_type,
                            section.name || null,
                            JSON.stringify(section.content || {}),
                            JSON.stringify(section.settings || {}),
                            i
                        ]);
                    }
                }

                await client.query('COMMIT');

                // Fetch complete page with sections
                const sectionsResult = await client.query(
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                    [page.id]
                );

                client.release();

                page.sections = sectionsResult.rows;
                res.status(201).json(page);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
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

            const client = await pool.connect();

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
                    client.release();
                    return res.status(400).json({ error: 'Slug already exists' });
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

            const result = await client.query(`
                UPDATE pages SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Page not found' });
            }

            // Get sections
            const sectionsResult = await client.query(
                'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                [id]
            );

            client.release();

            const page = result.rows[0];
            page.sections = sectionsResult.rows;

            res.json(page);
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
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM pages WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

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
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Get original page
                const originalResult = await client.query(
                    'SELECT * FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (originalResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(404).json({ error: 'Page not found' });
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
                    RETURNING *
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
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                    [id]
                );

                for (const section of sectionsResult.rows) {
                    await client.query(`
                        INSERT INTO page_sections (
                            page_id, organization_id, section_type, name, content, settings, section_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        newPage.id,
                        req.organizationId,
                        section.section_type,
                        section.name,
                        JSON.stringify(section.content),
                        JSON.stringify(section.settings),
                        section.section_order
                    ]);
                }

                await client.query('COMMIT');

                // Get new sections
                const newSectionsResult = await client.query(
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                    [newPage.id]
                );

                client.release();

                newPage.sections = newSectionsResult.rows;
                res.status(201).json(newPage);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            logger.error('Error duplicating page', { error: error.message });
            res.status(500).json({ error: 'Failed to duplicate page' });
        }
    });

    // ======================
    // Section Management
    // ======================

    /**
     * PUT /api/pages/:id/sections - Bulk update all sections
     */
    router.put('/:id/sections', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { sections } = req.body;

            if (!sections || !Array.isArray(sections)) {
                return res.status(400).json({ error: 'Sections array is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Verify page exists
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(404).json({ error: 'Page not found' });
                }

                // Delete existing sections
                await client.query('DELETE FROM page_sections WHERE page_id = $1', [id]);

                // Insert new sections
                for (let i = 0; i < sections.length; i++) {
                    const section = sections[i];
                    await client.query(`
                        INSERT INTO page_sections (
                            page_id, organization_id, section_type, name, content, settings, section_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        id,
                        req.organizationId,
                        section.section_type,
                        section.name || null,
                        JSON.stringify(section.content || {}),
                        JSON.stringify(section.settings || {}),
                        i
                    ]);
                }

                // Update page timestamp
                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                await client.query('COMMIT');

                // Fetch updated sections
                const result = await client.query(
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                    [id]
                );

                client.release();
                res.json({ sections: result.rows });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            logger.error('Error updating sections', { error: error.message });
            res.status(500).json({ error: 'Failed to update sections' });
        }
    });

    /**
     * POST /api/pages/:id/sections - Add section
     */
    router.post('/:id/sections', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { section_type, name, content, settings, position } = req.body;

            if (!section_type) {
                return res.status(400).json({ error: 'Section type is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Verify page exists
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(404).json({ error: 'Page not found' });
                }

                // Get current max order
                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(section_order), -1) as max_order FROM page_sections WHERE page_id = $1',
                    [id]
                );
                const maxOrder = orderResult.rows[0].max_order;
                const newOrder = position !== undefined ? position : maxOrder + 1;

                // Shift existing sections if inserting at position
                if (position !== undefined) {
                    await client.query(`
                        UPDATE page_sections SET section_order = section_order + 1
                        WHERE page_id = $1 AND section_order >= $2
                    `, [id, position]);
                }

                // Insert new section
                const result = await client.query(`
                    INSERT INTO page_sections (
                        page_id, organization_id, section_type, name, content, settings, section_order
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [
                    id,
                    req.organizationId,
                    section_type,
                    name || null,
                    JSON.stringify(content || {}),
                    JSON.stringify(settings || {}),
                    newOrder
                ]);

                // Update page timestamp
                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                await client.query('COMMIT');
                client.release();

                res.status(201).json(result.rows[0]);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            logger.error('Error adding section', { error: error.message });
            res.status(500).json({ error: 'Failed to add section' });
        }
    });

    /**
     * PUT /api/pages/:id/sections/:sectionId - Update section
     */
    router.put('/:id/sections/:sectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id, sectionId } = req.params;
            const { section_type, name, content, settings } = req.body;

            const client = await pool.connect();

            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (section_type !== undefined) {
                updates.push(`section_type = $${paramIndex++}`);
                params.push(section_type);
            }
            if (name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                params.push(name);
            }
            if (content !== undefined) {
                updates.push(`content = $${paramIndex++}`);
                params.push(JSON.stringify(content));
            }
            if (settings !== undefined) {
                updates.push(`settings = $${paramIndex++}`);
                params.push(JSON.stringify(settings));
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(sectionId, id, req.organizationId);

            const result = await client.query(`
                UPDATE page_sections SET ${updates.join(', ')}
                WHERE id = $${paramIndex++} AND page_id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, params);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Section not found' });
            }

            // Update page timestamp
            await client.query(
                'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating section:', error);
            res.status(500).json({ error: 'Failed to update section' });
        }
    });

    /**
     * DELETE /api/pages/:id/sections/:sectionId - Delete section
     */
    router.delete('/:id/sections/:sectionId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id, sectionId } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                DELETE FROM page_sections 
                WHERE id = $1 AND page_id = $2 AND organization_id = $3
                RETURNING section_order
            `, [sectionId, id, req.organizationId]);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Section not found' });
            }

            // Reorder remaining sections
            const deletedOrder = result.rows[0].section_order;
            await client.query(`
                UPDATE page_sections SET section_order = section_order - 1
                WHERE page_id = $1 AND section_order > $2
            `, [id, deletedOrder]);

            // Update page timestamp
            await client.query(
                'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            client.release();
            res.json({ success: true });
        } catch (error) {
            logger.error('Error deleting section', { error: error.message });
            res.status(500).json({ error: 'Failed to delete section' });
        }
    });

    /**
     * POST /api/pages/:id/sections/reorder - Reorder sections
     */
    router.post('/:id/sections/reorder', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { section_ids } = req.body;

            if (!section_ids || !Array.isArray(section_ids)) {
                return res.status(400).json({ error: 'Section IDs array is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Update order for each section
                for (let i = 0; i < section_ids.length; i++) {
                    await client.query(`
                        UPDATE page_sections SET section_order = $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2 AND page_id = $3 AND organization_id = $4
                    `, [i, section_ids[i], id, req.organizationId]);
                }

                // Update page timestamp
                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                await client.query('COMMIT');

                // Fetch updated sections
                const result = await client.query(
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
                    [id]
                );

                client.release();
                res.json({ sections: result.rows });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error reordering sections:', error);
            res.status(500).json({ error: 'Failed to reorder sections' });
        }
    });

    // ======================
    // Analytics
    // ======================

    /**
     * GET /api/pages/:id/analytics - Get page analytics
     */
    router.get('/:id/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { period = '30' } = req.query;
            const days = parseInt(period);

            const client = await pool.connect();

            // Verify page exists
            const pageCheck = await client.query(
                'SELECT id, view_count, unique_visitors FROM pages WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (pageCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Page not found' });
            }

            // Overall stats
            const overallStats = await client.query(`
                SELECT 
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_id) as unique_visitors,
                    AVG(time_on_page) as avg_time_on_page,
                    AVG(scroll_depth) as avg_scroll_depth,
                    COUNT(*) FILTER (WHERE converted = TRUE) as conversions
                FROM page_analytics
                WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
            `, [id]);

            // Views over time
            const viewsOverTime = await client.query(`
                SELECT 
                    DATE_TRUNC('day', viewed_at) as date,
                    COUNT(*) as views,
                    COUNT(DISTINCT visitor_id) as unique_visitors
                FROM page_analytics
                WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                GROUP BY DATE_TRUNC('day', viewed_at)
                ORDER BY date
            `, [id]);

            // Device distribution
            const deviceStats = await client.query(`
                SELECT device_type, COUNT(*) as count
                FROM page_analytics
                WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                GROUP BY device_type
            `, [id]);

            // Referrer distribution
            const referrerStats = await client.query(`
                SELECT 
                    COALESCE(referrer, 'Direct') as referrer,
                    COUNT(*) as count
                FROM page_analytics
                WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                GROUP BY referrer
                ORDER BY count DESC
                LIMIT 10
            `, [id]);

            // UTM sources
            const utmStats = await client.query(`
                SELECT 
                    utm_source, utm_medium, utm_campaign,
                    COUNT(*) as count
                FROM page_analytics
                WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                    AND utm_source IS NOT NULL
                GROUP BY utm_source, utm_medium, utm_campaign
                ORDER BY count DESC
                LIMIT 10
            `, [id]);

            client.release();

            res.json({
                period: days,
                overall: overallStats.rows[0],
                views_over_time: viewsOverTime.rows,
                devices: deviceStats.rows,
                referrers: referrerStats.rows,
                utm_sources: utmStats.rows
            });
        } catch (error) {
            logger.error('Error fetching analytics', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // ======================
    // Password Management (Phase 1.2)
    // ======================

    /**
     * POST /api/pages/:id/password - Set or update page password
     */
    router.post('/:id/password', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        const client = await pool.connect();

        try {
            // Verify page exists and belongs to organization
            const pageResult = await client.query(
                'SELECT id, settings FROM pages WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (pageResult.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

            // Update settings with hashed password
            const currentSettings = pageResult.rows[0].settings || {};
            const newSettings = { ...currentSettings, password: hashedPassword };

            await client.query(
                'UPDATE pages SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(newSettings), id]
            );

            logger.info('Page password updated', { pageId: id, organizationId: req.organizationId });
            res.json({ success: true, message: 'Password set successfully' });
        } finally {
            client.release();
        }
    }));

    /**
     * DELETE /api/pages/:id/password - Remove page password
     */
    router.delete('/:id/password', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const client = await pool.connect();

        try {
            // Verify page exists and belongs to organization
            const pageResult = await client.query(
                'SELECT id, settings FROM pages WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (pageResult.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            // Remove password from settings
            const currentSettings = pageResult.rows[0].settings || {};
            delete currentSettings.password;

            await client.query(
                'UPDATE pages SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(currentSettings), id]
            );

            logger.info('Page password removed', { pageId: id, organizationId: req.organizationId });
            res.json({ success: true, message: 'Password removed successfully' });
        } finally {
            client.release();
        }
    }));

    /**
     * POST /api/pages/:id/verify-password - Verify page password (public)
     */
    router.post('/:id/verify-password', publicRateLimit, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password required' });
        }

        const client = await pool.connect();

        try {
            const pageResult = await client.query(
                'SELECT settings FROM pages WHERE id = $1 AND status = $2',
                [id, 'published']
            );

            if (pageResult.rows.length === 0) {
                return res.status(404).json({ error: 'Page not found' });
            }

            const settings = pageResult.rows[0].settings || {};
            
            if (!settings.password) {
                return res.json({ valid: true, message: 'Page is not password protected' });
            }

            // Verify password
            let isValid = false;
            if (settings.password.startsWith('$2')) {
                isValid = await bcrypt.compare(password, settings.password);
            } else {
                isValid = password === settings.password;
            }

            if (isValid) {
                res.json({ valid: true });
            } else {
                res.status(401).json({ valid: false, error: 'Invalid password' });
            }
        } finally {
            client.release();
        }
    }));

    // ======================
    // Public Page Access
    // ======================

    /**
     * GET /api/pages/public/page/:slug - Get public page
     */
    router.get('/public/page/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const client = await pool.connect();

            const pageResult = await client.query(`
                SELECT p.*, o.name as organization_name
                FROM pages p
                JOIN organizations o ON p.organization_id = o.id
                WHERE p.slug = $1 AND p.status = 'published'
            `, [slug]);

            if (pageResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Page not found' });
            }

            const page = pageResult.rows[0];

            // Check if password protected (Phase 1.2 - use bcrypt)
            const settings = page.settings || {};
            if (settings.password) {
                const providedPassword = req.headers['x-page-password'] || req.query.password;
                
                if (!providedPassword) {
                    client.release();
                    return res.status(401).json({ error: 'Password required', password_protected: true });
                }
                
                // Support both hashed and legacy plaintext passwords
                let isValidPassword = false;
                if (settings.password.startsWith('$2')) {
                    // Bcrypt hashed password
                    isValidPassword = await bcrypt.compare(providedPassword, settings.password);
                } else {
                    // Legacy plaintext comparison (will be migrated on next password set)
                    isValidPassword = providedPassword === settings.password;
                }
                
                if (!isValidPassword) {
                    client.release();
                    return res.status(401).json({ error: 'Invalid password', password_protected: true });
                }
            }

            // Check expiration
            if (settings.expiresAt && new Date(settings.expiresAt) < new Date()) {
                client.release();
                return res.status(410).json({ error: 'Page has expired' });
            }

            // Get sections
            const sectionsResult = await client.query(`
                SELECT id, section_type, name, content, settings, section_order
                FROM page_sections
                WHERE page_id = $1
                ORDER BY section_order
            `, [page.id]);

            // Track analytics
            if (settings.enableAnalytics !== false) {
                const { deviceType, browser, os } = parseDeviceInfo(req.headers['user-agent']);
                const visitorId = req.cookies?.visitor_id || crypto.randomBytes(16).toString('hex');

                await client.query(`
                    INSERT INTO page_analytics (
                        page_id, organization_id, visitor_id, session_id,
                        ip_address, user_agent, referrer,
                        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                        device_type, browser, os
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                `, [
                    page.id,
                    page.organization_id,
                    visitorId,
                    crypto.randomBytes(8).toString('hex'),
                    req.ip,
                    req.headers['user-agent'],
                    req.headers['referer'] || null,
                    req.query.utm_source || null,
                    req.query.utm_medium || null,
                    req.query.utm_campaign || null,
                    req.query.utm_term || null,
                    req.query.utm_content || null,
                    deviceType,
                    browser,
                    os
                ]);

                // Update view count
                await client.query(
                    'UPDATE pages SET view_count = view_count + 1 WHERE id = $1',
                    [page.id]
                );
            }

            client.release();

            // Return public page data
            res.json({
                id: page.id,
                name: page.name,
                slug: page.slug,
                seo_title: page.seo_title,
                seo_description: page.seo_description,
                seo_keywords: page.seo_keywords,
                og_image: page.og_image,
                favicon_url: page.favicon_url,
                theme: page.theme,
                custom_css: page.custom_css,
                custom_js: page.custom_js,
                custom_head: page.custom_head,
                organization_name: page.organization_name,
                sections: sectionsResult.rows
            });
        } catch (error) {
            console.error('Error fetching public page:', error);
            res.status(500).json({ error: 'Failed to fetch page' });
        }
    });

    /**
     * POST /api/pages/public/page/:slug/analytics - Update analytics (time on page, etc.)
     */
    router.post('/public/page/:slug/analytics', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const { visitor_id, session_id, time_on_page, scroll_depth, converted, conversion_type, conversion_value } = req.body;

            if (!visitor_id || !session_id) {
                return res.status(400).json({ error: 'Visitor and session IDs required' });
            }

            const client = await pool.connect();

            await client.query(`
                UPDATE page_analytics SET
                    time_on_page = COALESCE($1, time_on_page),
                    scroll_depth = GREATEST(COALESCE($2, 0), scroll_depth),
                    converted = COALESCE($3, converted),
                    conversion_type = COALESCE($4, conversion_type),
                    conversion_value = COALESCE($5, conversion_value),
                    left_at = CURRENT_TIMESTAMP
                WHERE visitor_id = $6 AND session_id = $7
            `, [time_on_page, scroll_depth, converted, conversion_type, conversion_value, visitor_id, session_id]);

            client.release();
            res.json({ success: true });
        } catch (error) {
            logger.error('Error updating analytics', { error: error.message });
            res.status(500).json({ error: 'Failed to update analytics' });
        }
    });

    return router;
};
