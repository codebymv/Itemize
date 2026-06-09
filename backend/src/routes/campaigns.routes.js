/**
 * Email Campaigns Routes
 * CRUD operations and campaign sending functionality
 * Refactored with shared middleware (Phase 5)
 * Updated with feature gating (Subscription Phase 6)
 */

const express = require('express');
const crudRoutes = require('./campaigns/crud.routes');
const actionsRoutes = require('./campaigns/actions.routes');
const insightsRoutes = require('./campaigns/insights.routes');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(crudRoutes(pool, authenticateJWT, requireOrganization));
    router.use(actionsRoutes(pool, authenticateJWT, requireOrganization));
    router.use(insightsRoutes(pool, authenticateJWT, requireOrganization));

    return router;
};
