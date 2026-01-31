// ============================================
// Authentication Routes
// Supports both Google OAuth and Email/Password
// ============================================

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { userOperations } = require('./db');
const { logger } = require('./utils/logger');
const { generateVerificationToken, hashToken } = require('./utils/crypto');
const { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  sendWelcomeEmail, 
  sendPasswordChangedEmail,
  isEmailServiceConfigured 
} = require('./services/email.service');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  validate,
} = require('./lib/validators');

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
// JWT Token Configuration
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

// Stricter rate limiting for email-sending endpoints (10 attempts per 15 minutes)
const strictRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Cookie configuration for httpOnly secure cookies
// NOTE: sameSite must be 'none' for cross-origin requests (frontend and backend on different domains)
// When sameSite is 'none', secure MUST be true
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-origin
  maxAge: 15 * 60 * 1000, // 15 minutes for access token
  path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-origin
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
  path: '/api/auth',
};

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Token generation helper
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

// Helper to create personal organization for new users
const createPersonalOrganization = async (client, userId, userName) => {
  try {
    // Generate slug from name or email
    const slug = (userName || `user${userId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + `-${userId}`;

    // Create personal organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, slug, settings)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [`${userName}'s Workspace`, slug, JSON.stringify({ personal: true })]);

    const organization = orgResult.rows[0];

    // Add user as owner
    await client.query(`
      INSERT INTO organization_members (organization_id, user_id, role, joined_at)
      VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
    `, [organization.id, userId]);

    // Set as default organization
    await client.query(`
      UPDATE users 
      SET default_organization_id = $1 
      WHERE id = $2
    `, [organization.id, userId]);

    logger.info('Created personal organization', { userId, orgId: organization.id, slug });
    return organization;
  } catch (error) {
    logger.error('Failed to create personal organization', { userId, error: error.message });
    throw error;
  }
};

// ===========================
// EMAIL/PASSWORD REGISTRATION
// ===========================

/**
 * POST /api/auth/register
 * Create a new account with email and password
 */
router.post('/register', authRateLimit, validate(registerSchema), asyncHandler(async (req, res) => {
  const { email, password, name } = req.validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id, provider FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      if (user.provider === 'google') {
        return res.status(400).json({ 
          error: 'This email is already registered with Google. Please sign in with Google.',
          code: 'GOOGLE_ACCOUNT_EXISTS'
        });
      }
      return res.status(400).json({ 
        error: 'An account with this email already exists.',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate verification token
    const { token: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const result = await client.query(
      `INSERT INTO users (email, name, password_hash, provider, email_verified, verification_token, verification_token_expires, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, email, name`,
      [email, name || email.split('@')[0], passwordHash, 'email', false, verificationTokenHash, verificationTokenExpiry]
    );

    const user = result.rows[0];

    // Create personal organization for new user
    try {
      await createPersonalOrganization(client, user.id, user.name);
    } catch (orgError) {
      logger.error('Failed to create organization for new user', { userId: user.id, error: orgError.message });
      // Don't fail registration if org creation fails - user can create one later
    }

    // Send verification email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendVerificationEmail({ email: user.email, name: user.name }, verificationToken)
        .catch(err => logger.error('Failed to send verification email', { error: err.message }));
    } else {
      logger.warn('Email service not configured. Verification email not sent.');
    }

    logger.info('User registered', { email: user.email });

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      data: { email: user.email },
    });
  } finally {
    client.release();
  }
}));

// ===========================
// EMAIL/PASSWORD LOGIN
// ===========================

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', authRateLimit, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const pool = req.dbPool;
  
  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }
  
  const client = await pool.connect();
  try {
    // Find user by email
    const result = await client.query(
      'SELECT id, email, name, password_hash, provider, email_verified, role FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    // Check if user registered with Google
    if (user.provider === 'google') {
      return res.status(400).json({ 
        error: 'This email is registered with Google. Please sign in with Google.',
        code: 'GOOGLE_ACCOUNT'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check email verification
    if (!user.email_verified) {
      return res.status(401).json({ error: 'Email not verified. Please check your email to verify your account.' });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Set cookies
    res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);

    logger.info('User logged in', { email: user.email });

    res.json({
      success: true,
      token: accessToken,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'USER',
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      },
    });
  } finally {
    client.release();
  }
}));

// ===========================
// EMAIL VERIFICATION
// ===========================

/**
 * POST /api/auth/verify-email
 * Verify email address with token
 */
router.post('/verify-email', authRateLimit, validate(verifyEmailSchema), asyncHandler(async (req, res) => {
  const { token } = req.validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    // Find user with valid verification token
    const result = await client.query(
      `SELECT id, email, name, email_verified FROM users 
       WHERE verification_token = $1 AND verification_token_expires > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification link.',
        code: 'INVALID_TOKEN'
      });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ 
        error: 'Email is already verified.',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Update user
    await client.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Generate auth token (user is now logged in)
    const { accessToken, refreshToken } = generateTokens(user);

    // Set cookies
    res.cookie('itemize_auth', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);

    // Send welcome email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendWelcomeEmail({ email: user.email, name: user.name })
        .catch(err => logger.error('Failed to send welcome email', { error: err.message }));
    }

    logger.info('Email verified', { email: user.email });

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token: accessToken,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      },
    });
  } finally {
    client.release();
  }
}));

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', strictRateLimit, validate(resendVerificationSchema), asyncHandler(async (req, res) => {
  const { email } = req.validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    // Find user
    const result = await client.query(
      'SELECT id, email, name, email_verified FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a verification link.',
      });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.json({
        success: true,
        message: 'Your email is already verified. You can log in.',
      });
    }

    // Generate new verification token
    const { token: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user
    await client.query(
      `UPDATE users SET verification_token = $1, verification_token_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [verificationTokenHash, verificationTokenExpiry, user.id]
    );

    // Send verification email
    if (isEmailServiceConfigured()) {
      await sendVerificationEmail({ email: user.email, name: user.name }, verificationToken);
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a verification link.',
    });
  } finally {
    client.release();
  }
}));

// ===========================
// PASSWORD RESET
// ===========================

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', strictRateLimit, validate(forgotPasswordSchema), asyncHandler(async (req, res) => {
  const { email } = req.validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    // Find user
    const result = await client.query(
      'SELECT id, email, name, provider FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    }

    const user = result.rows[0];

    // Don't send reset for Google-only accounts
    if (user.provider === 'google') {
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    }

    // Generate reset token
    const { token: resetToken, hash: resetTokenHash } = generateVerificationToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Update user
    await client.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [resetTokenHash, resetTokenExpiry, user.id]
    );

    // Send reset email
    if (isEmailServiceConfigured()) {
      await sendPasswordResetEmail({ email: user.email, name: user.name }, resetToken);
    }

    logger.info('Password reset requested', { email: user.email });

    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    });
  } finally {
    client.release();
  }
}));

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', authRateLimit, validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const { token, password } = req.validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    // Find user with valid reset token
    const result = await client.query(
      `SELECT id, email, name FROM users 
       WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset link.',
        code: 'INVALID_TOKEN'
      });
    }

    const user = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user
    await client.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Send confirmation email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendPasswordChangedEmail({ email: user.email, name: user.name })
        .catch(err => logger.error('Failed to send password changed email', { error: err.message }));
    }

    logger.info('Password reset', { email: user.email });

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in.',
    });
  } finally {
    client.release();
  }
}));

/**
 * POST /api/auth/change-password
 * Change password (authenticated)
 */
router.post('/change-password', asyncHandler(async (req, res) => {
  // Authenticate first
  const token = req.cookies?.itemize_auth || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Validate input
  let validatedBody;
  try {
    validatedBody = changePasswordSchema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.errors?.[0]?.message || 'Validation failed' });
  }

  const { currentPassword, newPassword } = validatedBody;
  const pool = req.dbPool;

  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable' });
  }

  const client = await pool.connect();
  try {
    // Get user with password
    const result = await client.query(
      'SELECT id, email, name, password_hash FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(400).json({ 
        error: 'This account uses Google sign-in and does not have a password.',
        code: 'NO_PASSWORD'
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Current password is incorrect.',
        code: 'INVALID_PASSWORD'
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, user.id]
    );

    // Send confirmation email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendPasswordChangedEmail({ email: user.email, name: user.name })
        .catch(err => logger.error('Failed to send password changed email', { error: err.message }));
    }

    logger.info('Password changed', { email: user.email });

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } finally {
    client.release();
  }
}));

// ===========================
// GOOGLE OAUTH (EXISTING)
// ===========================

/**
 * POST /api/auth/google-login
 * Handle Google OAuth login
 */
router.post('/google-login', authRateLimit, asyncHandler(async (req, res) => {
  try {
    const { googleId, email, name } = req.body;
    
    if (!googleId || !email || !name) {
      return res.status(400).json({ error: 'Missing user information' });
    }

    logger.info('Processing Google login', { email });
    
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    // Find or create user
    let user;
    let isNewUser = false;
    try {
      // Check if user exists first
      const existingUser = await userOperations.findByEmail(pool, email);
      isNewUser = !existingUser;
      
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
      logger.error('Error handling user', { error: error.message, stack: error.stack });
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
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    
    res.status(200).json({
      token: accessToken,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'USER',
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
      }
    });
  } catch (error) {
    logger.error('Google login error', { error: error.response?.data || error.message });
    res.status(500).json({ error: 'Failed to process authentication' });
  }
}));

/**
 * POST /api/auth/google-credential
 * Handle Google One Tap verification
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
    
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    // Find or create user
    let user;
    try {
      // Check if user exists first
      const existingUser = await userOperations.findByEmail(pool, email);
      const isNewUser = !existingUser;

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
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    
    res.status(200).json({
      token: accessToken,
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
// USER PROFILE
// ===========================

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.itemize_auth || req.headers.authorization?.split(' ')[1];
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
  const token = req.cookies?.itemize_auth || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
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
      res.json({ 
        success: true,
        token: newAccessToken
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

// ===========================
// JWT MIDDLEWARE
// ===========================

/**
 * Middleware to authenticate JWT
 */
const authenticateJWT = (req, res, next) => {
  let token = req.cookies?.itemize_auth;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(401);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

/**
 * Middleware to require admin role
 * Must be used after authenticateJWT
 */
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } 
    });
  }

  const pool = req.dbPool;
  if (!pool) {
    return res.status(503).json({ 
      success: false, 
      error: { message: 'Database connection unavailable', code: 'DB_UNAVAILABLE' } 
    });
  }

  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: { message: 'User not found', code: 'USER_NOT_FOUND' } 
      });
    }

    const userRole = result.rows[0].role || 'USER';
    
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Admin access required', code: 'FORBIDDEN' } 
      });
    }

    // Attach role to request for use in routes
    req.userRole = userRole;
    next();
  } catch (error) {
    console.error('Error checking admin role:', error);
    return res.status(500).json({ 
      success: false, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    });
  }
};

module.exports = {
  router,
  authenticateJWT,
  requireAdmin
};
