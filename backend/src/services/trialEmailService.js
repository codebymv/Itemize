/**
 * Trial Email Service
 * 
 * Handles sending trial-related emails (welcome and reminder emails).
 * Extends the existing EmailService infrastructure.
 */

const BaseService = require('./BaseService');
const { logger } = require('../utils/logger');
const pool = require('../db');
const fs = require('fs').promises;
const path = require('path');

// Check if Resend is available (optional dependency)
let Resend = null;
try {
  Resend = require('resend').Resend;
} catch (e) {
  logger.info('Resend package not installed - trial email sending disabled');
}

class TrialEmailService extends BaseService {
  constructor() {
    super('TrialEmailService', { timeout: 10000, maxRetries: 3 });
    
    this.resend = null;
    this.fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    this.isConfigured = false;

    if (Resend && process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      this.isConfigured = true;
      this.logInfo('Trial email service configured with Resend');
    } else {
      this.logWarn('Trial email service not configured - set RESEND_API_KEY to enable');
    }
  }

  /**
   * Load email template from file
   */
  async loadTemplate(templateName) {
    try {
      const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
      const template = await fs.readFile(templatePath, 'utf-8');
      return template;
    } catch (error) {
      this.logError(`Failed to load template ${templateName}:`, error);
      return null;
    }
  }

  /**
   * Replace template variables
   */
  replaceVariables(template, data) {
    if (!template) return template;
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  /**
   * Log sent email to prevent duplicates
   */
  async logEmail(organizationId, emailType) {
    try {
      // Check if email_type column exists, if not use metadata
      await pool.query(
        `INSERT INTO email_logs (organization_id, to_email, subject, body_html, status, metadata, sent_at, queued_at)
         VALUES ($1, 'system@itemize.cloud', $2, '', 'sent', $3, NOW(), NOW())`,
        [organizationId, `Trial Email: ${emailType}`, JSON.stringify({ email_type: emailType })]
      );
    } catch (error) {
      this.logError('Failed to log email:', error);
    }
  }

  /**
   * Check if email was already sent
   */
  async wasEmailSent(organizationId, emailType) {
    try {
      const result = await pool.query(
        `SELECT 1 FROM email_logs 
         WHERE organization_id = $1 
         AND metadata->>'email_type' = $2`,
        [organizationId, emailType]
      );
      return result.rows.length > 0;
    } catch (error) {
      this.logError('Failed to check email log:', error);
      return false;
    }
  }

  /**
   * Send welcome email when trial starts
   * 
   * @param {Object} data - Welcome email data
   * @param {number} data.organizationId - Organization ID
   * @param {string} data.organizationName - Organization name
   * @param {string} data.userEmail - User email address
   * @param {string} data.userName - User name
   * @param {string} data.trialStartDate - Trial start date (ISO string)
   * @param {string} data.trialEndDate - Trial end date (ISO string)
   * @param {string} data.planName - Plan name being trialed
   * @param {string} data.billingPageUrl - URL to billing page
   */
  async sendWelcomeEmail(data) {
    if (!this.isConfigured) {
      this.logWarn('Cannot send welcome email - service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    // Check if already sent
    const alreadySent = await this.wasEmailSent(data.organizationId, 'trial_welcome');
    if (alreadySent) {
      this.logInfo(`Welcome email already sent to organization ${data.organizationId}`);
      return { success: true, skipped: true };
    }

    try {
      // Load template
      let template = await this.loadTemplate('welcome-email');
      
      // Fallback to inline template if file doesn't exist
      if (!template) {
        template = this.getWelcomeEmailTemplate();
      }

      // Format dates
      const trialEndFormatted = new Date(data.trialEndDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      // Replace variables
      const html = this.replaceVariables(template, {
        userName: data.userName || 'there',
        organizationName: data.organizationName,
        planName: data.planName,
        trialEndDate: trialEndFormatted,
        billingPageUrl: data.billingPageUrl,
      });

      // Send email
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: data.userEmail,
        subject: `Welcome to itemize.cloud - Your ${data.planName} Trial Starts Now!`,
        html,
      });

      // Log sent email
      await this.logEmail(data.organizationId, 'trial_welcome');

      this.logInfo(`Welcome email sent to ${data.userEmail} (org: ${data.organizationId})`);
      return { success: true, result };
    } catch (error) {
      this.logError('Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send reminder email 3 days before trial expires
   * 
   * @param {Object} data - Reminder email data
   * @param {number} data.organizationId - Organization ID
   * @param {string} data.organizationName - Organization name
   * @param {string} data.userEmail - User email address
   * @param {string} data.userName - User name
   * @param {string} data.trialEndDate - Trial end date (ISO string)
   * @param {number} data.daysRemaining - Days remaining in trial
   * @param {string} data.planName - Plan name being trialed
   * @param {string} data.addPaymentUrl - URL to add payment method
   */
  async sendTrialReminderEmail(data) {
    if (!this.isConfigured) {
      this.logWarn('Cannot send reminder email - service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    // Check if already sent
    const alreadySent = await this.wasEmailSent(data.organizationId, 'trial_reminder');
    if (alreadySent) {
      this.logInfo(`Reminder email already sent to organization ${data.organizationId}`);
      return { success: true, skipped: true };
    }

    try {
      // Load template
      let template = await this.loadTemplate('trial-reminder-email');
      
      // Fallback to inline template if file doesn't exist
      if (!template) {
        template = this.getTrialReminderTemplate();
      }

      // Format dates
      const trialEndFormatted = new Date(data.trialEndDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      // Replace variables
      const html = this.replaceVariables(template, {
        userName: data.userName || 'there',
        organizationName: data.organizationName,
        planName: data.planName,
        daysRemaining: data.daysRemaining,
        trialEndDate: trialEndFormatted,
        addPaymentUrl: data.addPaymentUrl,
      });

      // Send email
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: data.userEmail,
        subject: `Your itemize.cloud Trial Ends in ${data.daysRemaining} Days`,
        html,
      });

      // Log sent email
      await this.logEmail(data.organizationId, 'trial_reminder');

      this.logInfo(`Reminder email sent to ${data.userEmail} (org: ${data.organizationId})`);
      return { success: true, result };
    } catch (error) {
      this.logError('Failed to send reminder email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inline welcome email template (fallback)
   */
  getWelcomeEmailTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to itemize.cloud</title>
  <style>
    body { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .content h2 { color: #2563eb; font-size: 22px; margin-top: 0; }
    .content p { margin: 16px 0; color: #555; }
    .trial-info { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 20px; margin: 24px 0; }
    .trial-info strong { color: #2563eb; }
    .features { margin: 24px 0; }
    .features li { margin: 12px 0; color: #555; }
    .cta-button { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 24px 0; }
    .cta-button:hover { background-color: #1d4ed8; }
    .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to itemize.cloud!</h1>
    </div>
    <div class="content">
      <h2>Hi {{userName}},</h2>
      <p>Welcome to itemize.cloud! Your 14-day trial of the <strong>{{planName}}</strong> plan has started.</p>
      
      <div class="trial-info">
        <p><strong>Trial Details:</strong></p>
        <p>• Plan: {{planName}}<br>
        • Trial Ends: {{trialEndDate}}</p>
      </div>

      <p><strong>What's Included:</strong></p>
      <ul class="features">
        <li>Full access to all {{planName}} features</li>
        <li>Unlimited contacts and workflows</li>
        <li>Email and SMS campaigns</li>
        <li>Advanced automation tools</li>
        <li>Priority support</li>
      </ul>

      <p>Get started by exploring your dashboard and setting up your first workflow!</p>

      <a href="{{billingPageUrl}}" class="cta-button">Manage Billing</a>

      <p>Questions? Reply to this email or visit our help center.</p>

      <p>Best regards,<br>The itemize.cloud Team</p>
    </div>
    <div class="footer">
      <p>© 2026 itemize.cloud. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Inline trial reminder template (fallback)
   */
  getTrialReminderTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Trial Ends Soon</title>
  <style>
    body { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .content h2 { color: #f59e0b; font-size: 22px; margin-top: 0; }
    .content p { margin: 16px 0; color: #555; }
    .warning-box { background-color: #fef3c7; border-left: 4px solid: #f59e0b; padding: 20px; margin: 24px 0; }
    .warning-box strong { color: #d97706; }
    .consequences { margin: 24px 0; }
    .consequences li { margin: 12px 0; color: #555; }
    .cta-button { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 24px 0; }
    .cta-button:hover { background-color: #1d4ed8; }
    .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Trial Ends in {{daysRemaining}} Days</h1>
    </div>
    <div class="content">
      <h2>Hi {{userName}},</h2>
      <p>Your <strong>{{planName}}</strong> trial will expire on <strong>{{trialEndDate}}</strong>.</p>
      
      <div class="warning-box">
        <p><strong>To continue using itemize.cloud without interruption:</strong></p>
        <p>Add your payment method before {{trialEndDate}}</p>
      </div>

      <p><strong>What Happens When Trial Expires:</strong></p>
      <ul class="consequences">
        <li>Access to paid features will be restricted</li>
        <li>Your data will be preserved for 30 days</li>
        <li>You can reactivate anytime by subscribing</li>
      </ul>

      <a href="{{addPaymentUrl}}" class="cta-button">Add Payment Method Now</a>

      <p>Questions? We're here to help: support@itemize.cloud</p>

      <p>Best regards,<br>The itemize.cloud Team</p>
    </div>
    <div class="footer">
      <p>© 2026 itemize.cloud. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

// Export singleton instance
module.exports = new TrialEmailService();
