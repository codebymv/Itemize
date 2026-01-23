const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { userOperations } = require('./db');

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// CRITICAL: JWT_SECRET must be set - no fallback allowed
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
}

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
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/',
};

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Token generation helper
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
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

    console.log('Processing Google login for:', email);
    
    // Get the database pool from request
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    // Find or create a user in our database
    let user;
    try {
      console.log('Looking up user by email:', email);
      
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
      console.error('Error handling user:', error);
      res.status(500).json({ error: 'Database error occurred' });
      return;
    }
    
    // Create JWT token with 7-day expiry
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Set httpOnly cookie for secure token storage
    res.cookie('itemize_auth', token, COOKIE_OPTIONS);
    
    // Return the user data (token still included for backward compatibility)
    res.status(200).json({
      token, // Keep for backward compatibility during transition
      user: {
        uid: user.id, // Use uid to match frontend expected format
        email: user.email,
        name: user.name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random` // Use default avatar generator
      }
    });
  } catch (error) {
    console.error('Google login error:', error.response?.data || error.message);
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
      console.error('Error handling Google credential user:', error);
      res.status(500).json({ error: 'Database error, using in-memory user store' });
      return;
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Set httpOnly cookie for secure token storage
    res.cookie('itemize_auth', token, COOKIE_OPTIONS);
    
    res.status(200).json({
      token, // Keep for backward compatibility during transition
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      }
    });
  } catch (error) {
    console.error('Google credential verification error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to verify Google credential' });
  }
}));

/**
 * Logout endpoint
 */
router.post('/logout', (req, res) => {
  // Clear the httpOnly cookie by setting it with an expired date
  res.cookie('itemize_auth', '', {
    ...COOKIE_OPTIONS,
    maxAge: 0, // Expire immediately
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

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