const express = require('express');
const axios = require('axios');
const { userOperations } = require('../db');
const { logger } = require('../utils/logger');
const { GOOGLE_CLIENT_ID, authRateLimit, ACCESS_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS } = require('./config');
const { asyncHandler, generateTokens, createPersonalOrganization } = require('./helpers');

module.exports = () => {
  const router = express.Router();

// GOOGLE OAUTH (EXISTING)
// ===========================

/**
 * POST /api/auth/google-login
 * Handle Google OAuth access-token login
 */
router.post('/google-login', authRateLimit, asyncHandler(async (req, res) => {
  // Prevent caching of auth responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const { accessToken: googleAccessToken } = req.body || {};
  if (!googleAccessToken || typeof googleAccessToken !== 'string') {
    return res.status(400).json({
      error: 'Google access token is required',
      code: 'GOOGLE_ACCESS_TOKEN_REQUIRED'
    });
  }

  let googleIdentity;
  try {
    const tokenInfoResponse = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { access_token: googleAccessToken },
      timeout: 5000,
    });
    if (!GOOGLE_CLIENT_ID || tokenInfoResponse.data?.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Invalid Google token audience', code: 'INVALID_GOOGLE_TOKEN' });
    }

    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      timeout: 5000,
    });
    googleIdentity = userInfoResponse.data;
  } catch (error) {
    logger.warn('Google access token verification failed', { error: error.message });
    return res.status(401).json({ error: 'Invalid Google access token', code: 'INVALID_GOOGLE_TOKEN' });
  }

  const googleId = googleIdentity?.sub;
  const trimmedEmail = googleIdentity?.email?.trim().toLowerCase();
  const trimmedName = (googleIdentity?.name || trimmedEmail?.split('@')[0] || '').trim();
  const emailVerified = googleIdentity?.email_verified === true || googleIdentity?.email_verified === 'true';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!googleId || !emailVerified || !emailRegex.test(trimmedEmail || '')) {
    return res.status(401).json({ error: 'Invalid Google identity', code: 'INVALID_GOOGLE_IDENTITY' });
  }
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return res.status(400).json({ error: 'Invalid Google profile name', code: 'INVALID_GOOGLE_PROFILE' });
  }

  const pool = req.dbPool;
  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  let user;
  try {
    await userOperations.findByEmail(pool, trimmedEmail);
    user = await userOperations.findOrCreate(pool, {
      email: trimmedEmail,
      name: trimmedName,
      googleId,
      provider: 'google'
    });

    if (!user) throw new Error('Failed to create or retrieve user');

    await pool.query(
      'UPDATE users SET email_verified = true WHERE id = $1 AND email_verified = false',
      [user.id]
    );
    const orgCheck = await pool.query(
      'SELECT default_organization_id FROM users WHERE id = $1',
      [user.id]
    );

    if (!orgCheck.rows[0]?.default_organization_id) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await createPersonalOrganization(client, user.id, user.name);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    logger.error('Error handling Google user', { error: error.message, stack: error.stack });
    if (error.message?.includes('timeout')) {
      return res.status(503).json({ error: 'Database connection timeout. Please try again.' });
    }
    return res.status(500).json({ error: 'Database error occurred' });
  }

  const { accessToken, refreshToken } = generateTokens(user);
  res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
  logger.info('[Auth] Google session established', { userId: user.id });

  return res.status(200).json({
    success: true,
    user: {
      uid: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'USER',
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
    }
  });
}));

/**
 * POST /api/auth/google-credential
 * Handle Google One Tap verification
 */
router.post('/google-credential', authRateLimit, asyncHandler(async (req, res) => {
  // Prevent caching of auth responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    // Verify the Google ID token with proper encoding and audience validation
    const verifyResponse = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    
    const { sub: googleId, email, name, aud, iss } = verifyResponse.data;
    
    // SECURITY: Verify the token audience matches our client ID
    if (aud !== GOOGLE_CLIENT_ID) {
      logger.error('[Auth] Google token audience mismatch', { 
        expected: GOOGLE_CLIENT_ID, 
        received: aud,
        email 
      });
      return res.status(401).json({ error: 'Invalid token audience' });
    }
    
    // Verify issuer is Google
    if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
      logger.error('[Auth] Invalid token issuer', { iss, email });
      return res.status(401).json({ error: 'Invalid token issuer' });
    }
    
    // Input validation
    const trimmedName = name?.trim() || 'User';
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return res.status(400).json({ error: 'Invalid name length' });
    }
    
    const trimmedEmail = email.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    // Find or create user
    let user;
    try {
      // Check if user exists first
      await userOperations.findByEmail(pool, email);

      user = await userOperations.findOrCreate(pool, {
        email,
        name,
        googleId,
        provider: 'google'
      });
      
      if (!user) {
        throw new Error('Failed to create or retrieve user');
      }

      // Ensure Google users are marked as verified and have an organization
      // Use pool.query instead of manual connect/release to prevent connection leaks
      await pool.query(
        'UPDATE users SET email_verified = true WHERE id = $1 AND email_verified = false',
        [user.id]
      );

      // Check if user has an organization
      const orgCheck = await pool.query(
        'SELECT default_organization_id FROM users WHERE id = $1',
        [user.id]
      );

      if (!orgCheck.rows[0]?.default_organization_id) {
        // Create personal organization for new Google users
        // Use a transaction to ensure atomicity
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await createPersonalOrganization(client, user.id, user.name);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      logger.error('Error handling Google credential user', { error: error.message, stack: error.stack });
      // Provide more specific error messages
      if (error.message && error.message.includes('timeout')) {
        return res.status(503).json({ error: 'Database connection timeout. Please try again.' });
      }
      return res.status(500).json({ error: 'Database error occurred' });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Set cookies
    res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
    logger.info("[Auth] Cookies set", { accessToken: !!accessToken, refreshToken: !!refreshToken });
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    logger.info("[Auth] Refresh cookie set");
    
    res.status(200).json({
      success: true,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'USER',
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      }
    });
  } catch (error) {
    logger.error('Google credential verification error', { error: error.response?.data || error.message });
    res.status(500).json({ error: 'Failed to verify Google credential' });
  }
}));

// ===========================

  return router;
};
