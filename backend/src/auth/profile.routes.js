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

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.itemize_auth;
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } 
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: { message: 'Token expired', code: 'TOKEN_EXPIRED' } 
      });
    }
    return res.status(401).json({ 
      success: false, 
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' } 
    });
  }

  const { name } = req.body;
  
  // Input validation with length limits
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: { message: 'Name is required', code: 'NAME_REQUIRED' } 
    });
  }
  
  const trimmedName = name.trim();
  if (trimmedName.length < 1) {
    return res.status(400).json({ 
      success: false, 
      error: { message: 'Name cannot be empty', code: 'NAME_EMPTY' } 
    });
  }
  
  if (trimmedName.length > 100) {
    return res.status(400).json({ 
      success: false, 
      error: { message: 'Name must be 100 characters or less', code: 'NAME_TOO_LONG' } 
    });
  }

  const pool = req.dbPool;
  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
      [name.trim(), decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: user,
    });
  } finally {
    client.release();
  }
}));

// ===========================

  return router;
};
