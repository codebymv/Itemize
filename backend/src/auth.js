// ============================================
// Authentication middleware compatibility export.
// Browser authentication operations are owned by NestJS GraphQL.
// ============================================

const { authenticateJWT, requireAdmin } = require('./auth/middleware');

module.exports = {
  authenticateJWT,
  requireAdmin
};
