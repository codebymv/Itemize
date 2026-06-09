const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { logger } = require('../../utils/logger');
const { withDbClient } = require('../../utils/db');
const { parseDeviceInfo } = require('./helpers');
const { pageColumns } = require('./columns');

module.exports = ({ pool, publicRateLimit }) => {
    const router = express.Router();

// Public Page Access
    // ======================

    /**
     * GET /api/pages/public/page/:slug - Get public page
     */
    router.get('/public/page/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const outcome = await withDbClient(pool, async (client) => {
                const pageResult = await client.query(`
                    SELECT ${pageColumns('p')}, o.name as organization_name
                    FROM pages p
                    JOIN organizations o ON p.organization_id = o.id
                    WHERE p.slug = $1 AND p.status = 'published'
                `, [slug]);

                if (pageResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const page = pageResult.rows[0];
                const settings = page.settings || {};

                if (settings.password) {
                    const providedPassword = req.headers['x-page-password'] || req.query.password;
                    if (!providedPassword) {
                        return { status: 'password_required' };
                    }

                    let isValidPassword = false;
                    if (settings.password.startsWith('$2')) {
                        isValidPassword = await bcrypt.compare(providedPassword, settings.password);
                    } else {
                        isValidPassword = providedPassword === settings.password;
                    }

                    if (!isValidPassword) {
                        return { status: 'invalid_password' };
                    }
                }

                if (settings.expiresAt && new Date(settings.expiresAt) < new Date()) {
                    return { status: 'expired' };
                }

                const sectionsResult = await client.query(`
                    SELECT id, section_type, name, content, settings, section_order
                    FROM page_sections
                    WHERE page_id = $1
                    ORDER BY section_order
                `, [page.id]);

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

                    await client.query(
                        'UPDATE pages SET view_count = view_count + 1 WHERE id = $1',
                        [page.id]
                    );
                }

                return { status: 'ok', page, sections: sectionsResult.rows };
            });

            if (outcome.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }
            if (outcome.status === 'password_required') {
                return res.status(401).json({ error: 'Password required', password_protected: true });
            }
            if (outcome.status === 'invalid_password') {
                return res.status(401).json({ error: 'Invalid password', password_protected: true });
            }
            if (outcome.status === 'expired') {
                return res.status(410).json({ error: 'Page has expired' });
            }

            res.json({
                id: outcome.page.id,
                name: outcome.page.name,
                slug: outcome.page.slug,
                seo_title: outcome.page.seo_title,
                seo_description: outcome.page.seo_description,
                seo_keywords: outcome.page.seo_keywords,
                og_image: outcome.page.og_image,
                favicon_url: outcome.page.favicon_url,
                theme: outcome.page.theme,
                custom_css: outcome.page.custom_css,
                custom_js: outcome.page.custom_js,
                custom_head: outcome.page.custom_head,
                organization_name: outcome.page.organization_name,
                sections: outcome.sections
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
            const { visitor_id, session_id, time_on_page, scroll_depth, converted, conversion_type, conversion_value } = req.body;

            if (!visitor_id || !session_id) {
                return res.status(400).json({ error: 'Visitor and session IDs required' });
            }

            await withDbClient(pool, async (client) => {
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
            });
            res.json({ success: true });
        } catch (error) {
            logger.error('Error updating analytics', { error: error.message });
            res.status(500).json({ error: 'Failed to update analytics' });
        }
    });

    return router;
};
