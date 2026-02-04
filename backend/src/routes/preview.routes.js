/**
 * Page Preview Routes
 * Serves live page and version previews
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { withDbClient } = require('../utils/db');
const publicRateLimit = require('express-rate-limit');

const previewRateLimit = publicRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many preview requests' }
});

module.exports = (pool) => {

    /**
     * GET /api/preview/version/:versionId - Preview a specific page version
     */
    router.get('/version/:versionId', previewRateLimit, async (req, res) => {
        const { versionId } = req.params;

        try {
            const result = await withDbClient(pool, async (client) => {
                const versionResult = await client.query(`
                    SELECT pv.*, p.organization_id, o.name as organization_name
                    FROM page_versions pv
                    JOIN pages p ON pv.page_id = p.id
                    JOIN organizations o ON p.organization_id = o.id
                    WHERE pv.id = $1
                `, [versionId]);

                if (versionResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const version = versionResult.rows[0];
                const content = JSON.parse(version.content);

                return {
                    status: 'ok',
                    page: {
                        id: version.page_id,
                        name: content.name,
                        description: content.description,
                        slug: content.slug,
                        seo_title: content.seo_title,
                        seo_description: content.seo_description,
                        seo_keywords: content.seo_keywords,
                        og_image: content.og_image,
                        favicon_url: content.favicon_url,
                        theme: content.theme,
                        custom_css: content.custom_css,
                        custom_js: content.custom_js,
                        custom_head: content.custom_head,
                        organization_name: version.organization_name,
                        is_preview: true,
                        version_number: version.version_number
                    },
                    sections: content.sections || []
                };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Version not found' });
            }

            res.json({
                id: result.page.id,
                name: result.page.name,
                slug: result.page.slug,
                seo_title: result.page.seo_title,
                seo_description: result.page.seo_description,
                seo_keywords: result.page.seo_keywords,
                og_image: result.page.og_image,
                favicon_url: result.page.favicon_url,
                theme: result.page.theme,
                custom_css: result.page.custom_css,
                custom_js: result.page.custom_js,
                custom_head: result.page.custom_head,
                organization_name: result.page.organization_name,
                sections: result.sections,
                is_preview: result.page.is_preview,
                version_number: result.page.version_number
            });
        } catch (error) {
            logger.error('Error loading version preview', { error: error.message });
            res.status(500).json({ error: 'Failed to load preview' });
        }
    });

    return router;
};