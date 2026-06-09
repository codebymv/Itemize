const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { logger } = require('../utils/logger');
const { generateVerificationToken, hashToken } = require('../utils/crypto');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  isEmailServiceConfigured
} = require('../services/email.service');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  validate,
} = require('../lib/validators');
const { JWT_SECRET, authRateLimit, strictRateLimit, ACCESS_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS } = require('./config');
const { asyncHandler, generateTokens, createPersonalOrganization } = require('./helpers');

module.exports = () => {
  const router = express.Router();

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
    
    // Check if user registered with Google OR has no password (OAuth accounts)
    if (user.provider === 'google' || !user.password_hash) {
      return res.status(400).json({ 
        error: 'This email is registered with Google. Please sign in with Google.',
        code: 'GOOGLE_ACCOUNT'
      });
    }
    
    // Verify password (only reached if password_hash exists)
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
    logger.info("[Auth] Cookies set", { accessToken: !!accessToken, refreshToken: !!refreshToken });
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    logger.info("[Auth] Refresh cookie set");

    logger.info('User logged in', { email: user.email });

    res.json({
      success: true,
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
    logger.info("[Auth] Cookies set", { accessToken: !!accessToken, refreshToken: !!refreshToken });
    res.cookie('itemize_refresh', refreshToken, REFRESH_COOKIE_OPTIONS);
    logger.info("[Auth] Refresh cookie set");

    // Send welcome email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendWelcomeEmail({ email: user.email, name: user.name })
        .catch(err => logger.error('Failed to send welcome email', { error: err.message }));
    }

    logger.info('Email verified', { email: user.email });

    res.json({
      success: true,
      message: 'Email verified successfully!',
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

  return router;
};
