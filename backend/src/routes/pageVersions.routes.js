/**
 * Page Version Routes
 * Staging, versioning, and rollback functionality
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { withDbClient, withTransaction } = require('../utils/db');
const { asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, authenticateJWT, requireOrganization) => {

    /**
     * GET /api/pages/:id/versions - List all page versions
     */
    router.get('/:id/versions', authenticateJWT, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { organizationId } = req;

        try {
            const result = await withDbClient(pool, async (client) => {
                // Verify page ownership
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                // Get versions ordered by version number desc
                const versionsResult = await client.query(`
                    SELECT 
                        pv.*,
                        u.name as created_by_name
                    FROM page_versions pv
                    LEFT JOIN users u ON pv.created_by = u.id
                    WHERE pv.page_id = $1
                    ORDER BY pv.version_number DESC
                `, [id]);

                // Get current production version
                const currentResult = await client.query(
                    'SELECT current_version_id FROM pages WHERE id = $1',
                    [id]
                );

                return {
                    status: 'ok',
                    versions: versionsResult.rows,
                    currentVersionId: currentResult.rows[0]?.current_version_id
                };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json({
                versions: result.versions,
                currentVersionId: result.currentVersionId
            });
        } catch (error) {
            logger.error('Error fetching versions', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch versions' });
        }
    }));

    /**
     * POST /api/pages/:id/versions - Create a new version
     */
    router.post('/:id/versions', authenticateJWT, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { organizationId, user } = req;
        const { description } = req.body;

        try {
            const result = await withTransaction(pool, async (client) => {
                // Verify page ownership
                const pageResult = await client.query(
                    'SELECT * FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );

                if (pageResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const page = pageResult.rows[0];

                // Get next version number
                const versionResult = await client.query(
                    'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM page_versions WHERE page_id = $1',
                    [id]
                );
                const versionNumber = versionResult.rows[0].next_version;

                // Get current page content and sections
                const sectionsResult = await client.query(
                    'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order ASC',
                    [id]
                );

                // Create new version
                const versionInsert = await client.query(`
                    INSERT INTO page_versions (
                        page_id, version_number, content, description, created_by
                    ) VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `, [
                    id,
                    versionNumber,
                    JSON.stringify({
                        name: page.name,
                        description: page.description,
                        slug: page.slug,
                        theme: page.theme,
                        settings: page.settings,
                        seo_title: page.seo_title,
                        seo_description: page.seo_description,
                        seo_keywords: page.seo_keywords,
                        og_image: page.og_image,
                        favicon_url: page.favicon_url,
                        custom_css: page.custom_css,
                        custom_js: page.custom_js,
                        custom_head: page.custom_head,
                        sections: sectionsResult.rows
                    }),
                    description || `Version ${versionNumber}`,
                    user.id
                ]);

                return {
                    status: 'ok',
                    version: versionInsert.rows[0]
                };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.status(201).json(result.version);
        } catch (error) {
            logger.error('Error creating version', { error: error.message });
            res.status(500).json({ error: 'Failed to create version' });
        }
    }));

    /**
     * GET /api/pages/:id/versions/:versionId - Get specific version details
     */
    router.get('/:id/versions/:versionId', authenticateJWT, asyncHandler(async (req, res) => {
        const { id, versionId } = req.params;
        const { organizationId } = req;

        try {
            const result = await withDbClient(pool, async (client) => {
                const versionResult = await client.query(`
                    SELECT 
                        pv.*,
                        u.name as created_by_name
                    FROM page_versions pv
                    LEFT JOIN users u ON pv.created_by = u.id
                    WHERE pv.id = $1 AND pv.page_id = $2
                `, [versionId, id]);

                if (versionResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const version = versionResult.rows[0];

                // Verify ownership
                const pageCheck = await client.query(
                    'SELECT organization_id FROM pages WHERE id = $1',
                    [id]
                );

                if (pageCheck.rows[0]?.organization_id !== organizationId) {
                    return { status: 'forbidden' };
                }

                return { status: 'ok', version };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Version not found' });
            }
            if (result.status === 'forbidden') {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(result.version);
        } catch (error) {
            logger.error('Error fetching version', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch version' });
        }
    }));

    /**
     * POST /api/pages/:id/versions/:versionId/publish - Publish version from staging
     */
    router.post('/:id/versions/:versionId/publish', authenticateJWT, asyncHandler(async (req, res) => {
        const { id, versionId } = req.params;
        const { organizationId } = req;

        try {
            const result = await withTransaction(pool, async (client) => {
                // Verify page ownership
                const pageCheck = await client.query(
                    'SELECT id, status FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                // Get version
                const versionResult = await client.query(
                    'SELECT * FROM page_versions WHERE id = $1 AND page_id = $2',
                    [versionId, id]
                );

                if (versionResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const version = versionResult.rows[0];
                const content = JSON.parse(version.content);

                // Update page with version content
                await client.query(`
                    UPDATE pages SET
                        name = $1,
                        description = $2,
                        theme = $3,
                        current_version_id = $4,
                        published_at = CURRENT_TIMESTAMP
                    WHERE id = $5
                `, [content.name, content.description, content.theme ? JSON.stringify(content.theme) : null, versionId, id]);

                // Delete existing sections
                await client.query('DELETE FROM page_sections WHERE page_id = $1', [id]);

                // Create sections from version
                if (content.sections && Array.isArray(content.sections)) {
                    for (let i = 0; i < content.sections.length; i++) {
                        const section = content.sections[i];
                        await client.query(`
                            INSERT INTO page_sections (
                                page_id, organization_id, section_type, name, content, settings, section_order
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [
                            id,
                            organizationId,
                            section.section_type,
                            section.name || null,
                            JSON.stringify(section.content || {}),
                            JSON.stringify(section.settings || {}),
                            i
                        ]);
                    }
                }

                // Update version status
                await client.query(
                    'UPDATE page_versions SET published_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [versionId]
                );

                return { status: 'ok', version };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Not found' });
            }

            res.json({ success: true, version: result.version });
        } catch (error) {
            logger.error('Error publishing version', { error: error.message });
            res.status(500).json({ error: 'Failed to publish version' });
        }
    }));

    /**
     * DELETE /api/pages/:id/versions/:versionId - Delete a version
     */
    router.delete('/:id/versions/:versionId', authenticateJWT, asyncHandler(async (req, res) => {
        const { id, versionId } = req.params;
        const { organizationId } = req;

        try {
            const result = await withDbClient(pool, async (client) => {
                // Check if version is current production version
                const pageCheck = await client.query(
                    'SELECT current_version_id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                if (pageCheck.rows[0].current_version_id === parseInt(versionId)) {
                    return { status: 'is_current' };
                }

                // Delete version
                const deleteResult = await client.query(
                    'DELETE FROM page_versions WHERE id = $1 AND page_id = $2 RETURNING id',
                    [versionId, id]
                );

                if (deleteResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                return { status: 'ok' };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Not found' });
            }
            if (result.status === 'is_current') {
                return res.status(400).json({ error: 'Cannot delete current production version' });
            }

            res.json({ success: true });
        } catch (error) {
            logger.error('Error deleting version', { error: error.message });
            res.status(500).json({ error: 'Failed to delete version' });
        }
    }));

    /**
     * POST /api/pages/:id/versions/:versionId/restore - Restore a version (rollback)
     */
    router.post('/:id/versions/:versionId/restore', authenticateJWT, asyncHandler(async (req, res) => {
        const { id, versionId } = req.params;
        const { organizationId } = req;

        try {
            const result = await withTransaction(pool, async (client) => {
                // Verify page ownership
                const pageCheck = await client.query(
                    'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                // Get versions
                const versionResult = await client.query(
                    'SELECT version_number FROM page_versions WHERE id = $1 AND page_id = $2',
                    [versionId, id]
                );

                if (versionResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const versionNumber = versionResult.rows[0].version_number;

                // Get next version number (for the restored version)
                const nextVersionResult = await client.query(
                    'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM page_versions WHERE page_id = $1',
                    [id]
                );
                const nextVersion = nextVersionResult.rows[0].next_version + 100; // Add 100 to indicate restoration

                // Clone the version as new version
                const cloneResult = await client.query(`
                    INSERT INTO page_versions (page_id, version_number, content, description, created_by)
                    SELECT $1, $2, content, 'Restored from version ' || $3, (SELECT created_by FROM page_versions WHERE id = $3)
                    FROM page_versions WHERE id = $3
                    RETURNING *
                `, [id, nextVersion, versionId]);

                return { status: 'ok', version: cloneResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Not found' });
            }

            res.status(201).json(result.version);
        } catch (error) {
            logger.error('Error restoring version', { error: error.message });
            res.status(500).json({ error: 'Failed to restore version' });
        }
    }));

    return router;
};