/**
 * Admin Routes - User Management and System Administration
 * Protected routes requiring ADMIN role
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess, sendBadRequest } = require('../utils/response');

module.exports = (pool, authenticateJWT, requireAdmin) => {
    const router = express.Router();

    // Apply authentication and admin check to all routes
    router.use(authenticateJWT);
    router.use(requireAdmin);

    // ============================================
    // Admin Self-Service Routes (Testing)
    // ============================================

    /**
     * PATCH /api/admin/me/plan
     * Change own plan tier (for testing purposes)
     */
    router.patch('/me/plan', asyncHandler(async (req, res) => {
        const { plan } = req.body;
        const validPlans = ['free', 'starter', 'unlimited', 'pro'];

        if (!plan || !validPlans.includes(plan.toLowerCase())) {
            return sendBadRequest(res, `Invalid plan. Must be one of: ${validPlans.join(', ')}`);
        }

        // Update the admin's organization plan
        // First, get the user's default organization
        const orgResult = await pool.query(
            `SELECT default_organization_id FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (!orgResult.rows[0]?.default_organization_id) {
            return sendBadRequest(res, 'No organization associated with user');
        }

        const organizationId = orgResult.rows[0].default_organization_id;

        // Get the plan_id from subscription_plans table
        const planName = plan.toLowerCase();
        const planResult = await pool.query(
            `SELECT id FROM subscription_plans WHERE name = $1 AND is_active = true LIMIT 1`,
            [planName]
        );

        if (!planResult.rows[0]) {
            return sendBadRequest(res, `Plan "${planName}" not found in subscription_plans table`);
        }

        const planId = planResult.rows[0].id;

        // Update or create subscription record
        await pool.query(`
            INSERT INTO subscriptions (organization_id, plan_id, status, created_at, updated_at)
            VALUES ($1, $2, 'active', NOW(), NOW())
            ON CONFLICT (organization_id) 
            DO UPDATE SET 
                plan_id = $2,
                status = 'active',
                updated_at = NOW()
        `, [organizationId, planId]);

        // Update organization's current_plan_id for backward compatibility
        await pool.query(
            `UPDATE organizations SET current_plan_id = $1, updated_at = NOW() WHERE id = $2`,
            [planId, organizationId]
        );

        logger.info('Admin changed plan tier', {
            userId: req.user.id,
            organizationId,
            newPlan: planName,
            planId
        });

        return sendSuccess(res, {
            message: `Plan updated to ${planName}`,
            plan: planName
        });
    }));

    // ============================================
    // User Management Routes
    // ============================================

    /**
     * GET /api/admin/users/count
     * Get total user count
     */
    router.get('/users/count', asyncHandler(async (req, res) => {
        const result = await pool.query('SELECT COUNT(*) FROM users');
        const count = parseInt(result.rows[0].count, 10);

        return sendSuccess(res, { count });
    }));

    /**
     * GET /api/admin/users/search
     * Search users for email recipients with pagination
     */
    router.get('/users/search', asyncHandler(async (req, res) => {
        const { query, page = '0', limit = '50', plan } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 100);
        const offset = pageNum * limitNum;

        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (query && query.trim()) {
            whereClause = `WHERE u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex}`;
            params.push(`%${query.trim()}%`);
            paramIndex++;
        }

        if (plan && plan !== 'all') {
            if (whereClause) {
                whereClause += ` AND COALESCE(sp.name, 'free') = $${paramIndex}`;
            } else {
                whereClause = `WHERE COALESCE(sp.name, 'free') = $${paramIndex}`;
            }
            params.push(plan);
            paramIndex++;
        }

        // Get users with plan information from subscriptions table
        const usersQuery = `
            SELECT 
                u.id, 
                u.email, 
                u.name, 
                u.role, 
                u.created_at,
                COALESCE(sp.name, 'free') as plan
            FROM users u
            LEFT JOIN organizations o ON o.id = u.default_organization_id
            LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status IN ('active', 'trialing')
            LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
            ${whereClause}
            ORDER BY u.created_at DESC 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(limitNum + 1, offset);

        const usersResult = await pool.query(usersQuery, params);
        const hasMore = usersResult.rows.length > limitNum;
        const users = hasMore ? usersResult.rows.slice(0, limitNum) : usersResult.rows;

        // Get total count (same filters as users query)
        const countQuery = `
            SELECT COUNT(*) 
            FROM users u
            LEFT JOIN organizations o ON o.id = u.default_organization_id
            LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status IN ('active', 'trialing')
            LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
            ${whereClause}
        `;
        const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove limit and offset params
        const total = parseInt(countResult.rows[0].count, 10);

        return sendSuccess(res, {
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role || 'USER',
                plan: u.plan || 'free',
                createdAt: u.created_at
            })),
            total,
            hasMore
        });
    }));

    /**
     * GET /api/admin/users/ids
     * Get all user IDs matching query
     */
    router.get('/users/ids', asyncHandler(async (req, res) => {
        const { query } = req.query;

        let whereClause = '';
        const params = [];

        if (query && query.trim()) {
            whereClause = `WHERE email ILIKE $1 OR name ILIKE $1`;
            params.push(`%${query.trim()}%`);
        }

        const result = await pool.query(
            `SELECT id FROM users ${whereClause}`,
            params
        );

        return sendSuccess(res, {
            ids: result.rows.map(u => u.id)
        });
    }));

    /**
     * GET /api/admin/users/by-ids
     * Get users by IDs
     */
    router.get('/users/by-ids', asyncHandler(async (req, res) => {
        const { ids } = req.query;

        if (!ids || typeof ids !== 'string') {
            return sendBadRequest(res, 'ids parameter required');
        }

        const idArray = ids.split(',').filter(Boolean).map(id => parseInt(id, 10));

        if (idArray.length === 0) {
            return sendSuccess(res, { users: [] });
        }

        const result = await pool.query(
            `SELECT id, email, name, role FROM users WHERE id = ANY($1)`,
            [idArray]
        );

        return sendSuccess(res, {
            users: result.rows.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role || 'USER'
            }))
        });
    }));

    /**
     * GET /api/admin/stats
     * Get system statistics
     */
    router.get('/stats', asyncHandler(async (req, res) => {
        const [usersCount, contactsCount, invoicesCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM contacts'),
            pool.query('SELECT COUNT(*) FROM invoices')
        ]);

        return sendSuccess(res, {
            users: parseInt(usersCount.rows[0].count, 10),
            contacts: parseInt(contactsCount.rows[0].count, 10),
            invoices: parseInt(invoicesCount.rows[0].count, 10)
        });
    }));

    return router;
};
