/**
 * Email Service - Handles email sending via Resend
 * Extended with retry logic and timeouts (Phase 6)
 */

const BaseService = require('./BaseService');
const { logger } = require('../utils/logger');
const { wrapInBrandedTemplate } = require('./email-template.service');

// Check if Resend is available (optional dependency)
let Resend = null;
try {
  Resend = require('resend').Resend;
} catch (e) {
  logger.info('Resend package not installed - email sending disabled');
}

class EmailService extends BaseService {
  constructor() {
    super('EmailService', { timeout: 10000, maxRetries: 3 });
    
    this.resend = null;
    this.fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    this.isConfigured = false;

    if (Resend && process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      this.isConfigured = true;
      this.logInfo('Email service configured with Resend');
    } else {
      this.logWarn('Email service not configured - set RESEND_API_KEY to enable');
    }
  }

  /**
   * Replace template variables with contact data
   * Variables format: {{variable_name}}
   */
  replaceVariables(template, data) {
    if (!template) return template;
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      // Support nested keys like contact.first_name
      const keys = key.split('.');
      let value = data;
      
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
      
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Extract variables from template
   */
  extractVariables(template) {
    const matches = template.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  }

  /**
   * Prepare email content from template
   */
  prepareEmailContent(template, contact, additionalData = {}) {
    const data = {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'there',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      job_title: contact.job_title || '',
      ...contact.custom_fields,
      ...additionalData,
    };

    const subject = this.replaceVariables(template.subject, data);
    let html = this.replaceVariables(template.body_html, data);
    
    // Wrap in branded template if not already a complete HTML document
    if (!html.toLowerCase().includes('<!doctype') && !html.toLowerCase().includes('<html')) {
      html = wrapInBrandedTemplate(html, {
        subject,
        showUnsubscribe: true  // Marketing/campaign emails should have unsubscribe
      });
    }

    return {
      subject,
      html,
      text: template.body_text ? this.replaceVariables(template.body_text, data) : null,
    };
  }

  /**
   * Send email using Resend with retry logic (Phase 6)
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content
   * @param {string} [options.from] - From address
   * @param {string} [options.replyTo] - Reply-to address
   * @param {string|string[]} [options.cc] - CC recipient(s)
   * @param {string|string[]} [options.bcc] - BCC recipient(s)
   * @param {Array} [options.tags] - Email tags for tracking
   * @param {Array} [options.attachments] - File attachments [{filename, content}]
   */
  async sendEmail({ to, subject, html, text, from, replyTo, cc, bcc, tags, attachments }) {
    if (!this.isConfigured) {
      this.logWarn('Email not sent - service not configured');
      return {
        success: false,
        error: 'Email service not configured',
        simulated: true,
      };
    }

    const emailOptions = {
      from: from || this.fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo,
      tags: tags || [],
    };

    // Add CC recipients if provided
    if (cc) {
      emailOptions.cc = Array.isArray(cc) ? cc : [cc];
    }

    // Add BCC recipients if provided
    if (bcc) {
      emailOptions.bcc = Array.isArray(bcc) ? bcc : [bcc];
    }

    // Add attachments if provided
    // Resend expects content as Buffer or base64 string
    if (attachments && attachments.length > 0) {
      emailOptions.attachments = attachments.map(att => {
        let content = att.content;
        
        // Log attachment info for debugging
        this.logInfo(`Processing attachment: ${att.filename}, type: ${typeof content}, isBuffer: ${Buffer.isBuffer(content)}, size: ${content ? content.length : 0} bytes`);
        
        // Convert Uint8Array to Buffer if needed
        if (content instanceof Uint8Array && !(content instanceof Buffer)) {
          content = Buffer.from(content);
        }
        
        // Ensure content is a Buffer
        if (!Buffer.isBuffer(content)) {
          this.logWarn(`Attachment ${att.filename} content is not a Buffer, attempting conversion`);
          content = Buffer.from(content);
        }
        
        // Resend requires base64 encoded content for attachments
        const attachmentData = {
          filename: att.filename,
          content: content.toString('base64')
        };
        
        this.logInfo(`Attachment prepared: ${att.filename}, base64 length: ${attachmentData.content.length}`);
        
        return attachmentData;
      });
      
      this.logInfo(`Attaching ${attachments.length} file(s) to email`);
    }

    try {
      const response = await this.withRetry(
        async () => this.resend.emails.send(emailOptions),
        { to: emailOptions.to, subject }
      );

      this.logInfo('Email sent successfully', { 
        to: emailOptions.to, 
        cc: emailOptions.cc, 
        subject,
        hasAttachments: !!(attachments && attachments.length > 0)
      });
      return {
        success: true,
        id: response.data?.id,
        response: response.data,
      };
    } catch (error) {
      this.logError('Error sending email', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using a template
   */
  async sendTemplateEmail({ template, contact, additionalData, from, replyTo }) {
    const content = this.prepareEmailContent(template, contact, additionalData);
    
    return this.sendEmail({
      to: contact.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      from,
      replyTo,
      tags: [
        { name: 'template_id', value: String(template.id) },
        { name: 'contact_id', value: String(contact.id) },
      ],
    });
  }

  /**
   * Send a test email
   */
  async sendTestEmail({ template, toEmail, sampleData = {} }) {
    // Use sample contact data for testing
    const sampleContact = {
      first_name: sampleData.first_name || 'John',
      last_name: sampleData.last_name || 'Doe',
      email: toEmail,
      phone: sampleData.phone || '+1 (555) 123-4567',
      company: sampleData.company || 'Acme Inc',
      job_title: sampleData.job_title || 'Marketing Manager',
      custom_fields: sampleData.custom_fields || {},
    };

    const content = this.prepareEmailContent(template, sampleContact, sampleData);

    return this.sendEmail({
      to: toEmail,
      subject: `[TEST] ${content.subject}`,
      html: content.html,
      text: content.text,
    });
  }

  /**
   * Check if email service is configured
   */
  isEnabled() {
    return this.isConfigured;
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
