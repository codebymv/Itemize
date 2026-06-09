const express = require('express');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { JWT_SECRET, ACCESS_TOKEN_EXPIRY, ACCESS_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS } = require('./config');
const { asyncHandler } = require('./helpers');

module.exports = () => {
  const router = express.Router();

// SESSION MANAGEMENT
// ===========================

/**
 * POST /api/auth/logout
 * Clear authentication cookies
 */
router.post('/logout', (req, res) => {
  res.cookie('itemize_auth', '', {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: 0,
  });
  res.cookie('itemize_refresh', '', {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: 0,
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  // Prevent caching of auth responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const refreshToken = req.cookies?.itemize_refresh;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    const pool = req.dbPool;
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, name, email_verified FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const user = result.rows[0];

      // Check if email is verified
      if (!user.email_verified) {
        return res.status(401).json({ 
          error: 'Email not verified',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }
      
      // Generate new access token
      const newAccessToken = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );
      
      res.cookie('itemize_auth', newAccessToken, ACCESS_COOKIE_OPTIONS);
      logger.info('[Auth] Access token refreshed', { accessToken: true, refreshToken: true });
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    logger.error('Token refresh error', { error: error.message });
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}));

// ===========================

  return router;
};
