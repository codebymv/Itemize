// ============================================
// Email Service using Resend
// ============================================

const { Resend } = require('resend');
const { logger } = require('../utils/logger');

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
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">Verify your email address</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi${user.name ? ` ${user.name}` : ''},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Thanks for signing up for ${APP_NAME}! Please verify your email address by clicking the button below.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(to right, #2563eb, #4f46e5);">
                    <a href="${verifyUrl}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; color: #71717a; font-size: 14px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; color: #2563eb; font-size: 14px; word-break: break-all;">
                ${verifyUrl}
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 14px;">
                This link will expire in 24 hours.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                If you didn't create an account with ${APP_NAME}, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">Reset your password</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi${user.name ? ` ${user.name}` : ''},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We received a request to reset your ${APP_NAME} password. Click the button below to choose a new password.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(to right, #2563eb, #4f46e5);">
                    <a href="${resetUrl}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; color: #71717a; font-size: 14px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; color: #2563eb; font-size: 14px; word-break: break-all;">
                ${resetUrl}
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 14px;">
                This link will expire in 1 hour.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to ${APP_NAME}! 🎉</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">You're all set!</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi${user.name ? ` ${user.name}` : ''},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your email has been verified and your ${APP_NAME} account is ready to go. You can now access all features of the platform.
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Here's what you can do with ${APP_NAME}:
              </p>
              <ul style="margin: 0 0 24px; padding-left: 24px; color: #52525b; font-size: 16px; line-height: 1.8;">
                <li>Organize your work with Lists, Notes, and Whiteboards</li>
                <li>Manage contacts and build relationships</li>
                <li>Track deals through visual sales pipelines</li>
                <li>Automate your workflows</li>
              </ul>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(to right, #2563eb, #4f46e5);">
                    <a href="${loginUrl}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                Questions? Reply to this email or visit our help center.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Changed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 24px;">Password Changed</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi${user.name ? ` ${user.name}` : ''},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your ${APP_NAME} password was successfully changed.
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                If you made this change, you can safely ignore this email.
              </p>
              <p style="margin: 0; color: #ef4444; font-size: 16px; line-height: 1.6; font-weight: 500;">
                If you did not change your password, please contact support immediately.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                This is an automated security notification from ${APP_NAME}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
