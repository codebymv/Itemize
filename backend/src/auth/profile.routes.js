const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');
const { asyncHandler } = require('./helpers');

module.exports = () => {
  const router = express.Router();

// USER PROFILE
// ===========================

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', asyncHandler(async (req, res) => {
  // Prevent caching of auth responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const token = req.cookies?.itemize_auth;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const pool = req.dbPool;
  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, name, provider, email_verified, role, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        emailVerified: user.email_verified,
        role: user.role || 'USER',
        createdAt: user.created_at,
      },
    });
  } finally {
    client.release();
  }
}));

// ===========================

  return router;
};
