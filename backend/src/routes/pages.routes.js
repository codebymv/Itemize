/**
 * Landing Pages Routes
 * CRUD operations, section management, and public page serving
 */

const express = require('express');
const crudRoutes = require('./pages/crud.routes');
const sectionsRoutes = require('./pages/sections.routes');
const analyticsRoutes = require('./pages/analytics.routes');
const passwordRoutes = require('./pages/password.routes');
const publicRoutes = require('./pages/public.routes');

module.exports = (pool, authenticateJWT, publicRateLimit) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    const protectedContext = { pool, authenticateJWT, requireOrganization };

    router.use(publicRoutes({ pool, publicRateLimit }));
    router.use(passwordRoutes({ ...protectedContext, publicRateLimit }));
    router.use(sectionsRoutes(protectedContext));
    router.use(analyticsRoutes(protectedContext));
    router.use(crudRoutes(protectedContext));

    return router;
};
