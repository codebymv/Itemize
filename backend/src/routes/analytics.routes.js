/**
 * Analytics Routes
 * Provides CRM statistics and reporting data for the dashboard
 */
const express = require('express');
const advancedRoutes = require('./analytics/advanced.routes');

/**
 * Create analytics routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(advancedRoutes(pool, authenticateJWT, requireOrganization));

    return router;
};
