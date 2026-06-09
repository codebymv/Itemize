// ============================================
// Authentication Routes
// Supports both Google OAuth and Email/Password
// ============================================

const express = require('express');
const credentialsRoutes = require('./auth/credentials.routes');
const googleRoutes = require('./auth/google.routes');
const profileRoutes = require('./auth/profile.routes');
const sessionRoutes = require('./auth/session.routes');
const { authenticateJWT, requireAdmin } = require('./auth/middleware');

const router = express.Router();

router.use(credentialsRoutes());
router.use(googleRoutes());
router.use(profileRoutes());
router.use(sessionRoutes());

module.exports = {
  router,
  authenticateJWT,
  requireAdmin
};
