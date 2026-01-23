/**
 * SMS Service - Handles SMS sending via Twilio
 */

// Check if Twilio is available (optional dependency)
let Twilio = null;
try {
  Twilio = require('twilio');
} catch (e) {
  console.log('Twilio package not installed - SMS sending disabled');
}

class SmsService {
  constructor() {
    this.client = null;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.isConfigured = false;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (Twilio && accountSid && authToken && this.fromNumber) {
      this.client = Twilio(accountSid, authToken);
      this.isConfigured = true;
      console.log('✅ SMS service configured with Twilio');
    } else {
      console.log('⚠️ SMS service not configured - set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to enable');
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
   * Normalize phone number to E.164 format
   * @param {string} phone - Phone number in various formats
   * @returns {string} - Phone number in E.164 format or original if can't normalize
   */
  normalizePhoneNumber(phone) {
    if (!phone) return phone;
    
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, assume US/Canada and add +1
    if (!normalized.startsWith('+')) {
      // Remove leading 1 if present (common in US numbers)
      if (normalized.startsWith('1') && normalized.length === 11) {
        normalized = '+' + normalized;
      } else if (normalized.length === 10) {
        normalized = '+1' + normalized;
      } else {
        normalized = '+' + normalized;
      }
    }
    
    return normalized;
  }

  /**
   * Validate phone number (basic validation)
   */
  isValidPhoneNumber(phone) {
    if (!phone) return false;
    const normalized = this.normalizePhoneNumber(phone);
    // E.164 format: + followed by 7-15 digits
    return /^\+[1-9]\d{6,14}$/.test(normalized);
  }

  /**
   * Prepare SMS content from template
   */
  prepareSmsContent(template, contact, additionalData = {}) {
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

    return {
      message: this.replaceVariables(template.message, data),
    };
  }

  /**
   * Send SMS using Twilio
   */
  async sendSms({ to, message, from, mediaUrl }) {
    if (!this.isConfigured) {
      console.log('SMS not sent - service not configured');
      return {
        success: false,
        error: 'SMS service not configured',
        simulated: true,
      };
    }

    // Normalize the phone number
    const normalizedTo = this.normalizePhoneNumber(to);
    
    if (!this.isValidPhoneNumber(normalizedTo)) {
      return {
        success: false,
        error: `Invalid phone number: ${to}`,
      };
    }

    try {
      const messageOptions = {
        body: message,
        from: from || this.fromNumber,
        to: normalizedTo,
      };

      // Add media URL if provided (for MMS)
      if (mediaUrl) {
        messageOptions.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
      }

      const response = await this.client.messages.create(messageOptions);

      return {
        success: true,
        id: response.sid,
        status: response.status,
        response: {
          sid: response.sid,
          status: response.status,
          dateCreated: response.dateCreated,
          to: response.to,
          from: response.from,
        },
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }

  /**
   * Send SMS using a template
   */
  async sendTemplateSms({ template, contact, additionalData, from }) {
    const content = this.prepareSmsContent(template, contact, additionalData);
    
    return this.sendSms({
      to: contact.phone,
      message: content.message,
      from,
    });
  }

  /**
   * Send a test SMS
   */
  async sendTestSms({ template, toPhone, sampleData = {} }) {
    // Use sample contact data for testing
    const sampleContact = {
      first_name: sampleData.first_name || 'John',
      last_name: sampleData.last_name || 'Doe',
      email: sampleData.email || 'john@example.com',
      phone: toPhone,
      company: sampleData.company || 'Acme Inc',
      job_title: sampleData.job_title || 'Marketing Manager',
      custom_fields: sampleData.custom_fields || {},
    };

    const content = this.prepareSmsContent(template, sampleContact, sampleData);

    return this.sendSms({
      to: toPhone,
      message: `[TEST] ${content.message}`,
    });
  }

  /**
   * Send a direct SMS (without template)
   */
  async sendDirectSms({ to, message, from }) {
    return this.sendSms({ to, message, from });
  }

  /**
   * Get message status from Twilio
   */
  async getMessageStatus(messageSid) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        success: true,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate Twilio webhook signature
   */
  validateWebhookSignature(signature, url, params) {
    if (!this.isConfigured) return false;
    
    try {
      return Twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        signature,
        url,
        params
      );
    } catch (error) {
      console.error('Error validating Twilio webhook:', error);
      return false;
    }
  }

  /**
   * Check if SMS service is configured
   */
  isEnabled() {
    return this.isConfigured;
  }

  /**
   * Get character count info for SMS
   * Standard SMS: 160 chars, Unicode: 70 chars
   */
  getMessageInfo(message) {
    if (!message) return { length: 0, segments: 0, encoding: 'GSM' };
    
    // Check if message contains non-GSM characters (requires Unicode)
    const gsmRegex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜä§¿a-zäöñüà]*$/;
    const isGsm = gsmRegex.test(message);
    
    const charsPerSegment = isGsm ? 160 : 70;
    const charsPerMultiSegment = isGsm ? 153 : 67; // When split into multiple segments
    
    const length = message.length;
    let segments;
    
    if (length <= charsPerSegment) {
      segments = 1;
    } else {
      segments = Math.ceil(length / charsPerMultiSegment);
    }
    
    return {
      length,
      segments,
      encoding: isGsm ? 'GSM' : 'Unicode',
      charsRemaining: segments === 1 
        ? charsPerSegment - length 
        : (segments * charsPerMultiSegment) - length,
    };
  }
}

// Singleton instance
const smsService = new SmsService();

module.exports = smsService;
