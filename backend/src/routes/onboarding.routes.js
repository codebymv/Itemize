/**
 * Onboarding Routes
 * Handles user onboarding progress tracking
 */
const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');
const { sendSuccess, sendBadRequest, sendError } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Create onboarding routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    const router = express.Router();

    /**
     * GET /api/onboarding/progress
     * Get current user's onboarding progress
     */
    router.get('/progress', authenticateJWT, asyncHandler(async (req, res) => {
        const result = await withDbClient(pool, async (client) => {
            return client.query(
                'SELECT onboarding_progress FROM users WHERE id = $1',
                [req.user.id]
            );
        });

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        const progress = result.rows[0].onboarding_progress || {};
        
        logger.info('Onboarding progress retrieved', { userId: req.user.id });
        return sendSuccess(res, progress);
    }));

    /**
     * GET /api/onboarding/progress/:featureKey
     * Get specific feature's onboarding status
     */
    router.get('/progress/:featureKey', authenticateJWT, asyncHandler(async (req, res) => {
        const { featureKey } = req.params;

        const result = await withDbClient(pool, async (client) => {
            return client.query(
                `SELECT onboarding_progress->>$1 as feature_progress 
                 FROM users WHERE id = $2`,
                [featureKey, req.user.id]
            );
        });

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        const featureProgress = result.rows[0].feature_progress 
            ? JSON.parse(result.rows[0].feature_progress)
            : { seen: false };
        
        return sendSuccess(res, featureProgress);
    }));

    /**
     * POST /api/onboarding/mark-seen
     * Mark a feature as seen
     */
    router.post('/mark-seen', authenticateJWT, asyncHandler(async (req, res) => {
        const { feature, version = '1.0' } = req.body;

        if (!feature || typeof feature !== 'string') {
            return sendBadRequest(res, 'feature key is required', 'feature');
        }

        const timestamp = new Date().toISOString();
        const progressUpdate = {
            seen: true,
            timestamp,
            version,
            dismissed: false
        };

        const result = await withDbClient(pool, async (client) => {
            return client.query(`
                UPDATE users 
                SET onboarding_progress = jsonb_set(
                    COALESCE(onboarding_progress, '{}'::jsonb),
                    $1::text[],
                    $2::jsonb,
                    true
                ),
                updated_at = NOW()
                WHERE id = $3
                RETURNING onboarding_progress
            `, [`{${feature}}`, JSON.stringify(progressUpdate), req.user.id]);
        });

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        // Optional: Log event (non-blocking)
        withDbClient(pool, async (client) => {
            await client.query(`
                INSERT INTO onboarding_events (user_id, feature_key, event_type, version, metadata)
                VALUES ($1, $2, $3, $4, $5)
            `, [req.user.id, feature, 'viewed', version, JSON.stringify({ timestamp })]);
        }).catch(err => {
            logger.warn('Failed to log onboarding event', { error: err.message, userId: req.user.id });
        });

        logger.info('Feature marked as seen', { userId: req.user.id, feature });
        return sendSuccess(res, result.rows[0].onboarding_progress);
    }));

    /**
     * POST /api/onboarding/dismiss
     * Dismiss a feature's onboarding
     */
    router.post('/dismiss', authenticateJWT, asyncHandler(async (req, res) => {
        const { feature } = req.body;

        if (!feature || typeof feature !== 'string') {
            return sendBadRequest(res, 'feature key is required', 'feature');
        }

        const result = await withDbClient(pool, async (client) => {
            return client.query(`
                UPDATE users 
                SET onboarding_progress = jsonb_set(
                    COALESCE(onboarding_progress, '{}'::jsonb),
                    $1::text[],
                    jsonb_set(
                        COALESCE(onboarding_progress->$2, '{"seen":true}'::jsonb),
                        '{dismissed}',
                        'true'::jsonb
                    )
                ),
                updated_at = NOW()
                WHERE id = $3
                RETURNING onboarding_progress
            `, [`{${feature}}`, feature, req.user.id]);
        });

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        // Optional: Log dismissal event (non-blocking)
        withDbClient(pool, async (client) => {
            await client.query(`
                INSERT INTO onboarding_events (user_id, feature_key, event_type)
                VALUES ($1, $2, $3)
            `, [req.user.id, feature, 'dismissed']);
        }).catch(err => {
            logger.warn('Failed to log dismissal event', { error: err.message });
        });

        logger.info('Feature onboarding dismissed', { userId: req.user.id, feature });
        return sendSuccess(res, result.rows[0].onboarding_progress);
    }));

    /**
     * POST /api/onboarding/complete-step
     * Mark a specific step as completed
     */
    router.post('/complete-step', authenticateJWT, asyncHandler(async (req, res) => {
        const { feature, step } = req.body;

        if (!feature || typeof feature !== 'string') {
            return sendBadRequest(res, 'feature key is required', 'feature');
        }

        if (typeof step !== 'number' || step < 0) {
            return sendBadRequest(res, 'step must be a non-negative number', 'step');
        }

        const result = await withDbClient(pool, async (client) => {
            return client.query(`
                UPDATE users 
                SET onboarding_progress = jsonb_set(
                    COALESCE(onboarding_progress, '{}'::jsonb),
                    $1::text[],
                    jsonb_set(
                        COALESCE(onboarding_progress->$2, '{}'::jsonb),
                        '{step_completed}',
                        $3::text::jsonb
                    )
                ),
                updated_at = NOW()
                WHERE id = $4
                RETURNING onboarding_progress
            `, [`{${feature}}`, feature, step, req.user.id]);
        });

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        // Optional: Log step completion (non-blocking)
        withDbClient(pool, async (client) => {
            await client.query(`
                INSERT INTO onboarding_events (user_id, feature_key, event_type, metadata)
                VALUES ($1, $2, $3, $4)
            `, [req.user.id, feature, 'step_completed', JSON.stringify({ step })]);
        }).catch(err => {
            logger.warn('Failed to log step completion', { error: err.message });
        });

        logger.info('Onboarding step completed', { userId: req.user.id, feature, step });
        return sendSuccess(res, result.rows[0].onboarding_progress);
    }));

    /**
     * DELETE /api/onboarding/reset
     * Reset onboarding progress (for testing or re-onboarding)
     */
    router.delete('/reset', authenticateJWT, asyncHandler(async (req, res) => {
        const { feature } = req.query;

        let result;
        if (feature) {
            // Reset specific feature
            result = await withDbClient(pool, async (client) => {
                return client.query(`
                    UPDATE users 
                    SET onboarding_progress = onboarding_progress - $1,
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING onboarding_progress
                `, [feature, req.user.id]);
            });
            logger.info('Feature onboarding reset', { userId: req.user.id, feature });
        } else {
            // Reset all onboarding
            result = await withDbClient(pool, async (client) => {
                return client.query(`
                    UPDATE users 
                    SET onboarding_progress = '{}'::jsonb,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING onboarding_progress
                `, [req.user.id]);
            });
            logger.info('All onboarding reset', { userId: req.user.id });
        }

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
        }

        return sendSuccess(res, result.rows[0].onboarding_progress);
    }));

    return router;
};
