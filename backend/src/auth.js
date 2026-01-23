const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { userOperations } = require('./db');
const { logger } = require('./utils/logger');

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// CRITICAL: JWT_SECRET must be set - no fallback allowed
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is required');
    throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
}

// ===========================
// JWT Token Configuration (Phase 1.3)
// ===========================
const ACCESS_TOKEN_EXPIRY = '15m';  // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '30d'; // Long-lived refresh token

// Strict rate limiting for authentication endpoints (5 attempts per 15 minutes)
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use IP + email if available for more precise limiting
        const email = req.body?.email || '';
        return `${req.ip}-${email}`;
    }
});

// Cookie configuration for httpOnly secure cookies
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes for access token
  path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
  path: '/api/auth', // Only sent to auth endpoints
};

// Legacy cookie options for backward compatibility
const COOKIE_OPTIONS = ACCESS_COOKIE_OPTIONS;

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Token generation helper (Phase 1.3)
const generateTokens = (user) => {
  const payload = { 
    id: user.id,
    email: user.email,
    name: user.name
  };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' }, 
    JWT_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  return { accessToken, refreshToken };
};

/**
 * Handle Google OAuth login endpoint using direct token-based approach
 * This endpoint receives user data from Google directly from the frontend
 * Protected by strict rate limiting to prevent brute force attacks
 */
router.post('/google-login', authRateLimit, asyncHandler(async (req, res) => {
  try {
    const { googleId, email, name } = req.body;
    
    if (!googleId || !email || !name) {
      return res.status(400).json({ error: 'Missing user information' });
    }

    logger.info('Processing Google login', { email });
    
    // Get the database pool from request
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    // Find or create a user in our database
    let user;
    try {
      logger.debug('Looking up user by email', { email });
      
      // Use the userOperations to find or create user
      user = await userOperations.findOrCreate(pool, {
        email,
        name,
        googleId,
        provider: 'google'
      });
      
      if (!user) {
        throw new Error('Failed to create or retrieve user');
      }
    } catch (error) {
      logger.error('Error handling user', { error: error.message });
      res.status(500).json({ error: 'Database error occurred' });
      return;
    }
    
    // Generate tokens (Phase 1.3 - short-lived access, long-lived refresh)
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Set httpOnly cookies for secure token storage
    res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    
    // Return the user data (token still included for backward compatibility)
    res.status(200).json({
      token: accessToken, // Keep for backward compatibility during transition
      user: {
        uid: user.id, // Use uid to match frontend expected format
        email: user.email,
        name: user.name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random` // Use default avatar generator
      }
    });
  } catch (error) {
    logger.error('Google login error', { error: error.response?.data || error.message });
    res.status(500).json({ error: 'Failed to process authentication' });
  }
}));

/**
 * Handle Google ID token verification endpoint for Google One Tap
 * Protected by strict rate limiting to prevent brute force attacks
 */
router.post('/google-credential', authRateLimit, asyncHandler(async (req, res) => {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    // Verify the Google ID token
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );
    
    const { sub: googleId, email, name, picture } = response.data;
    
    // Get the database pool from request
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    // Find or create a user in our database
    let user;
    try {
      // Use the userOperations to find or create user
      user = await userOperations.findOrCreate(pool, {
        email,
        name,
        googleId,
        provider: 'google'
      });
      
      if (!user) {
        throw new Error('Failed to create or retrieve user');
      }
    } catch (error) {
      logger.error('Error handling Google credential user', { error: error.message });
      res.status(500).json({ error: 'Database error occurred' });
      return;
    }
    
    // Generate tokens (Phase 1.3 - short-lived access, long-lived refresh)
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Set httpOnly cookies for secure token storage
    res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    
    res.status(200).json({
      token: accessToken, // Keep for backward compatibility during transition
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      }
    });
  } catch (error) {
    logger.error('Google credential verification error', { error: error.response?.data || error.message });
    res.status(500).json({ error: 'Failed to verify Google credential' });
  }
}));

/**
 * Logout endpoint
 */
router.post('/logout', (req, res) => {
  // Clear both access and refresh cookies
  res.cookie('itemize_auth', '', {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: 0, // Expire immediately
  });
  res.cookie('itemize_refresh', '', {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: 0, // Expire immediately
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * Refresh token endpoint (Phase 1.3)
 * Issues a new access token using a valid refresh token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.itemize_refresh;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    // Ensure it's a refresh token
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    // Get user from database to ensure they still exist
    const pool = req.dbPool;
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, name FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const user = result.rows[0];
      
      // Generate new access token only (don't rotate refresh token)
      const newAccessToken = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );
      
      res.cookie('itemize_auth', newAccessToken, ACCESS_COOKIE_OPTIONS);
      res.json({ 
        success: true,
        token: newAccessToken // For backward compatibility
      });
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

/**
 * Middleware to authenticate JWT
 * Reads token from httpOnly cookie first, falls back to Authorization header
 */
const authenticateJWT = (req, res, next) => {
  // Try to get token from httpOnly cookie first (more secure)
  let token = req.cookies?.itemize_auth;
  
  // Fall back to Authorization header for backward compatibility
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Export the router and middleware
module.exports = {
  router,
  authenticateJWT
};