// ============================================
// Email Service using Resend
// ============================================

const { Resend } = require('resend');
const { logger } = require('../utils/logger');
const { wrapInBrandedTemplate } = require('./email-template.service');

// Initialize Resend client
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'Itemize <noreply@itemize.cloud>';
// Always use production URL for email links so they work from any device
const APP_URL = process.env.APP_URL || 'https://itemize.cloud';
const APP_NAME = 'Itemize';

/**
 * Check if email service is configured
 * @returns {boolean}
 */
function isEmailServiceConfigured() {
  return !!resend;
}

/**
 * Send an email using Resend
 * @param {{ to: string | { email: string, name?: string }, subject: string, html: string, text?: string }} options
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    logger.warn('Email service not configured. RESEND_API_KEY not set.');
    // In development, log the email instead of failing
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Email would be sent:', { to, subject });
      return { success: true, id: 'dev-mode' };
    }
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const toEmail = typeof to === 'string' ? to : to.email;
    
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text fallback
    });

    if (error) {
      logger.error('Failed to send email', { error, to: toEmail, subject });
      return { success: false, error: error.message };
    }

    logger.info('Email sent successfully', { id: data?.id, to: toEmail, subject });
    return { success: true, id: data?.id };
  } catch (error) {
    logger.error('Email service error', { error: error.message, to, subject });
    return { success: false, error: error.message };
  }
}

/**
 * Send verification email
 * @param {{ email: string, name?: string }} user
 * @param {string} token - The verification token (unhashed)
 */
async function sendVerificationEmail(user, token) {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
  
  const bodyContent = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">Verify your email address</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Hi${user.name ? ` ${user.name}` : ''},
    </p>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Thanks for signing up for ${APP_NAME}! Please verify your email address by clicking the button below.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" class="button-primary">
        Verify Email Address
      </a>
    </div>
    
    <p style="margin: 0 0 16px; color: #71717a; font-size: 14px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; color: #2563eb; font-size: 14px; word-break: break-all;">
      ${verifyUrl}
    </p>
    
    <div class="callout-info">
      <p style="margin: 0; color: #1e40af; font-size: 14px;">
        ⏱️ This link will expire in 24 hours.
      </p>
    </div>
    
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      If you didn't create an account with ${APP_NAME}, you can safely ignore this email.
    </p>
  `;
  
  const html = wrapInBrandedTemplate(bodyContent, {
    subject: `Verify your ${APP_NAME} account`,
    showUnsubscribe: false  // Transactional email
  });

  return sendEmail({
    to: { email: user.email, name: user.name },
    subject: `Verify your ${APP_NAME} account`,
    html,
  });
}

/**
 * Send password reset email
 * @param {{ email: string, name?: string }} user
 * @param {string} token - The reset token (unhashed)
 */
async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  
  const bodyContent = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">Reset your password</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Hi${user.name ? ` ${user.name}` : ''},
    </p>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      We received a request to reset your ${APP_NAME} password. Click the button below to choose a new password.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="button-primary">
        Reset Password
      </a>
    </div>
    
    <p style="margin: 0 0 16px; color: #71717a; font-size: 14px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; color: #2563eb; font-size: 14px; word-break: break-all;">
      ${resetUrl}
    </p>
    
    <div class="callout-warning">
      <p style="margin: 0; color: #92400e; font-size: 14px;">
        ⏱️ This link will expire in 1 hour.
      </p>
    </div>
    
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
    </p>
  `;
  
  const html = wrapInBrandedTemplate(bodyContent, {
    subject: `Reset your ${APP_NAME} password`,
    showUnsubscribe: false  // Transactional email
  });

  return sendEmail({
    to: { email: user.email, name: user.name },
    subject: `Reset your ${APP_NAME} password`,
    html,
  });
}

/**
 * Send welcome email after verification
 * @param {{ email: string, name?: string }} user
 */
async function sendWelcomeEmail(user) {
  const loginUrl = `${APP_URL}/login`;
  
  const bodyContent = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px; color: #18181b; font-size: 28px;">Welcome to ${APP_NAME}! 🎉</h2>
      <p style="margin: 0; color: #22c55e; font-size: 16px; font-weight: 600;">You're all set!</p>
    </div>
    
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Hi${user.name ? ` ${user.name}` : ''},
    </p>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Your email has been verified and your ${APP_NAME} account is ready to go. You can now access all features of the platform.
    </p>
    
    <div class="callout-success">
      <p style="margin: 0 0 16px; color: #166534; font-weight: 600;">Here's what you can do with ${APP_NAME}:</p>
      <ul style="margin: 0; padding-left: 20px; color: #166534; line-height: 1.8;">
        <li>Create and send professional invoices</li>
        <li>Manage contacts and build relationships</li>
        <li>Track payments and financial reports</li>
        <li>Automate your workflows</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" class="button-primary">
        Go to Dashboard
      </a>
    </div>
    
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      Questions? Reply to this email or visit our help center.
    </p>
  `;
  
  const html = wrapInBrandedTemplate(bodyContent, {
    subject: `Welcome to ${APP_NAME}!`,
    showUnsubscribe: false  // Transactional email
  });

  return sendEmail({
    to: { email: user.email, name: user.name },
    subject: `Welcome to ${APP_NAME}!`,
    html,
  });
}

/**
 * Send password changed confirmation email
 * @param {{ email: string, name?: string }} user
 */
async function sendPasswordChangedEmail(user) {
  const bodyContent = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 64px; height: 64px; background: #dcfce7; border-radius: 50%; margin: 0 auto 16px; line-height: 64px; text-align: center;">
        <span style="font-size: 32px;">✓</span>
      </div>
      <h2 style="margin: 0; color: #18181b; font-size: 24px;">Password Changed</h2>
    </div>
    
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Hi${user.name ? ` ${user.name}` : ''},
    </p>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Your ${APP_NAME} password was successfully changed.
    </p>
    
    <div class="callout-success">
      <p style="margin: 0; color: #166534; font-size: 14px;">
        ✓ If you made this change, you can safely ignore this email.
      </p>
    </div>
    
    <div class="callout-error" style="margin-top: 16px;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: 500;">
        ⚠️ If you did NOT change your password, please contact support immediately.
      </p>
    </div>
    
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      This is an automated security notification from ${APP_NAME}.
    </p>
  `;
  
  const html = wrapInBrandedTemplate(bodyContent, {
    subject: `Your ${APP_NAME} password was changed`,
    showUnsubscribe: false  // Transactional/security email
  });

  return sendEmail({
    to: { email: user.email, name: user.name },
    subject: `Your ${APP_NAME} password was changed`,
    html,
  });
}

module.exports = {
  isEmailServiceConfigured,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  APP_URL,
  APP_NAME,
};
