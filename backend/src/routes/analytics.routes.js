/**
 * Analytics Routes
 * Provides CRM statistics and reporting data for the dashboard
 */
const express = require('express');
const dashboardRoutes = require('./analytics/dashboard.routes');
const contactsRoutes = require('./analytics/contacts.routes');
const businessRoutes = require('./analytics/business.routes');
const advancedRoutes = require('./analytics/advanced.routes');
const operationsRoutes = require('./analytics/operations.routes');

/**
 * Create analytics routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(dashboardRoutes(pool, authenticateJWT, requireOrganization));
    router.use(contactsRoutes(pool, authenticateJWT, requireOrganization));
    router.use(businessRoutes(pool, authenticateJWT, requireOrganization));
    router.use(advancedRoutes(pool, authenticateJWT, requireOrganization));
    router.use(operationsRoutes(pool, authenticateJWT, requireOrganization));

    return router;
};
