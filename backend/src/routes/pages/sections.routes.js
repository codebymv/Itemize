const express = require('express');
const { logger } = require('../../utils/logger');
const { withDbClient, withTransaction } = require('../../utils/db');
const { pageSectionColumns, PAGE_SECTION_UNNEST_COLUMNS } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

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

            const result = await withTransaction(pool, async (client) => {
                // Verify page exists
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                // Delete existing sections
                await client.query('DELETE FROM page_sections WHERE page_id = $1', [id]);

                // Insert new sections
                if (sections && sections.length > 0) {
                    await client.query(`
                        INSERT INTO page_sections (
                            page_id, organization_id, section_type, name, content, settings, section_order
                        )
                        SELECT ${PAGE_SECTION_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::int[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::jsonb[], $7::int[]
                        ) AS u(${PAGE_SECTION_UNNEST_COLUMNS})
                    `, [
                        sections.map(() => id),
                        sections.map(() => req.organizationId),
                        sections.map(s => s.section_type),
                        sections.map(s => s.name || null),
                        sections.map(s => JSON.stringify(s.content || {})),
                        sections.map(s => JSON.stringify(s.settings || {})),
                        sections.map((_, i) => i)
                    ]);
                }

                // Update page timestamp
                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                // Fetch updated sections
                const sectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [id]
                );

                return { status: 'ok', sections: sectionsResult.rows };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json({ sections: result.sections });
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

            const result = await withTransaction(pool, async (client) => {
                // Verify page exists
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
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
                const insertResult = await client.query(`
                    INSERT INTO page_sections (
                        page_id, organization_id, section_type, name, content, settings, section_order
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING ${pageSectionColumns()}
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

                return { status: 'ok', section: insertResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.status(201).json(result.section);
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

            const result = await withDbClient(pool, async (client) => {
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

                const updateResult = await client.query(`
                    UPDATE page_sections SET ${updates.join(', ')}
                    WHERE id = $${paramIndex++} AND page_id = $${paramIndex++} AND organization_id = $${paramIndex}
                    RETURNING ${pageSectionColumns()}
                `, params);

                if (updateResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                return { status: 'ok', section: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Section not found' });
            }

            res.json(result.section);
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
            const result = await withDbClient(pool, async (client) => {
                const deleteResult = await client.query(`
                    DELETE FROM page_sections 
                    WHERE id = $1 AND page_id = $2 AND organization_id = $3
                    RETURNING section_order
                `, [sectionId, id, req.organizationId]);

                if (deleteResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const deletedOrder = deleteResult.rows[0].section_order;
                await client.query(`
                    UPDATE page_sections SET section_order = section_order - 1
                    WHERE page_id = $1 AND section_order > $2
                `, [id, deletedOrder]);

                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                return { status: 'ok' };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Section not found' });
            }

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

            const result = await withTransaction(pool, async (client) => {
                for (let i = 0; i < section_ids.length; i++) {
                    await client.query(`
                        UPDATE page_sections SET section_order = $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2 AND page_id = $3 AND organization_id = $4
                    `, [i, section_ids[i], id, req.organizationId]);
                }

                await client.query(
                    'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                const sectionsResult = await client.query(
                    `SELECT ${pageSectionColumns()} FROM page_sections WHERE page_id = $1 ORDER BY section_order`,
                    [id]
                );

                return sectionsResult.rows;
            });

            res.json({ sections: result });
        } catch (error) {
            console.error('Error reordering sections:', error);
            res.status(500).json({ error: 'Failed to reorder sections' });
        }
    });

    // ======================

    return router;
};
