const express = require('express');
const bcrypt = require('bcrypt');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { SALT_ROUNDS } = require('./helpers');

module.exports = ({ pool, authenticateJWT, requireOrganization, publicRateLimit }) => {
    const router = express.Router();

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

        const result = await withDbClient(pool, async (client) => {
            const pageResult = await client.query(
                'SELECT id, settings FROM pages WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (pageResult.rows.length === 0) {
                return { status: 'not_found' };
            }

            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            const currentSettings = pageResult.rows[0].settings || {};
            const newSettings = { ...currentSettings, password: hashedPassword };

            await client.query(
                'UPDATE pages SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(newSettings), id]
            );

            return { status: 'ok' };
        });

        if (result.status === 'not_found') {
            return res.status(404).json({ error: 'Page not found' });
        }

        logger.info('Page password updated', { pageId: id, organizationId: req.organizationId });
        res.json({ success: true, message: 'Password set successfully' });
    }));

    /**
     * DELETE /api/pages/:id/password - Remove page password
     */
    router.delete('/:id/password', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await withDbClient(pool, async (client) => {
            const pageResult = await client.query(
                'SELECT id, settings FROM pages WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (pageResult.rows.length === 0) {
                return { status: 'not_found' };
            }

            const currentSettings = pageResult.rows[0].settings || {};
            delete currentSettings.password;

            await client.query(
                'UPDATE pages SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(currentSettings), id]
            );

            return { status: 'ok' };
        });

        if (result.status === 'not_found') {
            return res.status(404).json({ error: 'Page not found' });
        }

        logger.info('Page password removed', { pageId: id, organizationId: req.organizationId });
        res.json({ success: true, message: 'Password removed successfully' });
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

        const result = await withDbClient(pool, async (client) => {
            const pageResult = await client.query(
                'SELECT settings FROM pages WHERE id = $1 AND status = $2',
                [id, 'published']
            );

            if (pageResult.rows.length === 0) {
                return { status: 'not_found' };
            }

            const settings = pageResult.rows[0].settings || {};

            if (!settings.password) {
                return { status: 'no_password' };
            }

            let isValid = false;
            if (settings.password.startsWith('$2')) {
                isValid = await bcrypt.compare(password, settings.password);
            } else {
                isValid = password === settings.password;
            }

            return { status: 'ok', isValid };
        });

        if (result.status === 'not_found') {
            return res.status(404).json({ error: 'Page not found' });
        }
        if (result.status === 'no_password') {
            return res.json({ valid: true, message: 'Page is not password protected' });
        }

        if (result.isValid) {
            res.json({ valid: true });
        } else {
            res.status(401).json({ valid: false, error: 'Invalid password' });
        }
    }));

    // ======================

    return router;
};
