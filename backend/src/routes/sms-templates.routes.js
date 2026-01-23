/**
 * SMS Templates Routes
 * CRUD operations for SMS templates, sending SMS, and Twilio webhooks
 */

const express = require('express');
const router = express.Router();
const smsService = require('../services/smsService');

/**
 * Create SMS templates routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Function} publicRateLimit - Rate limiting middleware for public endpoints
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {

  /**
   * Middleware to require organization context
   */
  const requireOrganization = async (req, res, next) => {
    try {
      const organizationId = req.query.organization_id || req.body.organization_id || req.headers['x-organization-id'];

      if (!organizationId) {
        const client = await pool.connect();
        const result = await client.query(
          'SELECT default_organization_id FROM users WHERE id = $1',
          [req.user.id]
        );
        client.release();

        if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
          return res.status(400).json({ error: 'Organization ID required.' });
        }
        req.organizationId = result.rows[0].default_organization_id;
      } else {
        req.organizationId = parseInt(organizationId);
      }

      // Verify user has access to this organization
      const client = await pool.connect();
      const memberCheck = await client.query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [req.organizationId, req.user.id]
      );
      client.release();

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      req.orgRole = memberCheck.rows[0].role;
      next();
    } catch (error) {
      console.error('Error in requireOrganization middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /api/sms-templates
   * List all SMS templates for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { category, is_active, search } = req.query;

    try {
      const client = await pool.connect();

      let query = `
        SELECT 
          st.*,
          u.name as created_by_name
        FROM sms_templates st
        LEFT JOIN users u ON st.created_by = u.id
        WHERE st.organization_id = $1
      `;
      const params = [req.organizationId];
      let paramIndex = 2;

      if (category) {
        query += ` AND st.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND st.is_active = $${paramIndex}`;
        params.push(is_active === 'true');
        paramIndex++;
      }

      if (search) {
        query += ` AND (st.name ILIKE $${paramIndex} OR st.message ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ' ORDER BY st.updated_at DESC';

      const result = await client.query(query, params);
      client.release();

      res.json({
        templates: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching SMS templates:', error);
      res.status(500).json({ error: 'Failed to fetch SMS templates' });
    }
  });

  /**
   * GET /api/sms-templates/categories/list
   * Get list of template categories
   */
  router.get('/categories/list', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT DISTINCT category, COUNT(*) as count
         FROM sms_templates 
         WHERE organization_id = $1
         GROUP BY category
         ORDER BY category`,
        [req.organizationId]
      );
      client.release();

      res.json({
        categories: result.rows,
      });
    } catch (error) {
      console.error('Error fetching template categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  /**
   * GET /api/sms-templates/:id
   * Get a single SMS template
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT 
          st.*,
          u.name as created_by_name
        FROM sms_templates st
        LEFT JOIN users u ON st.created_by = u.id
        WHERE st.id = $1 AND st.organization_id = $2`,
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'SMS template not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching SMS template:', error);
      res.status(500).json({ error: 'Failed to fetch SMS template' });
    }
  });

  /**
   * POST /api/sms-templates
   * Create a new SMS template
   */
  router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
    const userId = req.user?.id;
    const { name, message, category, is_active } = req.body;

    // Validation
    if (!name || !message) {
      return res.status(400).json({
        error: 'name and message are required'
      });
    }

    try {
      // Extract variables from template
      const variables = smsService.extractVariables(message);
      const uniqueVariables = [...new Set(variables)];

      // Get message info
      const messageInfo = smsService.getMessageInfo(message);

      const client = await pool.connect();
      const result = await client.query(
        `INSERT INTO sms_templates 
          (organization_id, name, message, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          req.organizationId,
          name,
          message,
          JSON.stringify(uniqueVariables),
          category || 'general',
          is_active !== false,
          userId,
        ]
      );
      client.release();

      res.status(201).json({
        ...result.rows[0],
        message_info: messageInfo,
      });
    } catch (error) {
      console.error('Error creating SMS template:', error);
      res.status(500).json({ error: 'Failed to create SMS template' });
    }
  });

  /**
   * PUT /api/sms-templates/:id
   * Update an SMS template
   */
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { name, message, category, is_active } = req.body;

    try {
      const client = await pool.connect();

      // Check template exists and belongs to org
      const existing = await client.query(
        'SELECT * FROM sms_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'SMS template not found' });
      }

      const template = existing.rows[0];

      // Build update values
      const finalName = name !== undefined ? name : template.name;
      const finalMessage = message !== undefined ? message : template.message;
      const finalCategory = category !== undefined ? category : template.category;
      const finalIsActive = is_active !== undefined ? is_active : template.is_active;

      // Re-extract variables
      const variables = smsService.extractVariables(finalMessage);
      const uniqueVariables = [...new Set(variables)];

      const result = await client.query(
        `UPDATE sms_templates 
         SET name = $1, message = $2, variables = $3, category = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND organization_id = $7
         RETURNING *`,
        [
          finalName,
          finalMessage,
          JSON.stringify(uniqueVariables),
          finalCategory,
          finalIsActive,
          id,
          req.organizationId,
        ]
      );
      client.release();

      // Get message info
      const messageInfo = smsService.getMessageInfo(finalMessage);

      res.json({
        ...result.rows[0],
        message_info: messageInfo,
      });
    } catch (error) {
      console.error('Error updating SMS template:', error);
      res.status(500).json({ error: 'Failed to update SMS template' });
    }
  });

  /**
   * DELETE /api/sms-templates/:id
   * Delete an SMS template
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        'DELETE FROM sms_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'SMS template not found' });
      }

      res.json({ success: true, deleted_id: result.rows[0].id });
    } catch (error) {
      console.error('Error deleting SMS template:', error);
      res.status(500).json({ error: 'Failed to delete SMS template' });
    }
  });

  /**
   * POST /api/sms-templates/:id/send-test
   * Send a test SMS using the template
   */
  router.post('/:id/send-test', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { to_phone, sample_data } = req.body;

    if (!to_phone) {
      return res.status(400).json({ error: 'to_phone is required' });
    }

    try {
      const client = await pool.connect();
      const result = await client.query(
        'SELECT * FROM sms_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'SMS template not found' });
      }

      const template = result.rows[0];

      // Send test SMS
      const sendResult = await smsService.sendTestSms({
        template,
        toPhone: to_phone,
        sampleData: sample_data || {},
      });

      if (sendResult.success) {
        res.json({
          success: true,
          message: 'Test SMS sent successfully',
          sms_id: sendResult.id,
          status: sendResult.status,
        });
      } else if (sendResult.simulated) {
        res.json({
          success: true,
          simulated: true,
          message: 'SMS service not configured - SMS would have been sent',
        });
      } else {
        res.status(500).json({
          success: false,
          error: sendResult.error,
        });
      }
    } catch (error) {
      console.error('Error sending test SMS:', error);
      res.status(500).json({ error: 'Failed to send test SMS' });
    }
  });

  /**
   * POST /api/sms-templates/:id/duplicate
   * Duplicate an SMS template
   */
  router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
      const client = await pool.connect();

      // Get the original template
      const original = await client.query(
        'SELECT * FROM sms_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (original.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'SMS template not found' });
      }

      const template = original.rows[0];

      // Create duplicate with "(Copy)" suffix
      const result = await client.query(
        `INSERT INTO sms_templates 
          (organization_id, name, message, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          req.organizationId,
          `${template.name} (Copy)`,
          template.message,
          JSON.stringify(template.variables),
          template.category,
          false, // Start as inactive
          userId,
        ]
      );
      client.release();

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error duplicating SMS template:', error);
      res.status(500).json({ error: 'Failed to duplicate SMS template' });
    }
  });

  /**
   * POST /api/sms-templates/send-to-contact
   * Send an SMS to a specific contact (with optional template)
   */
  router.post('/send-to-contact', authenticateJWT, requireOrganization, async (req, res) => {
    const userId = req.user?.id;
    const {
      contact_id,
      template_id,
      message: customMessage,
    } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }

    // Must have either template_id or custom message
    if (!template_id && !customMessage) {
      return res.status(400).json({
        error: 'Either template_id or message is required'
      });
    }

    try {
      const client = await pool.connect();

      // Get contact
      const contactResult = await client.query(
        'SELECT * FROM contacts WHERE id = $1 AND organization_id = $2',
        [contact_id, req.organizationId]
      );

      if (contactResult.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Contact not found' });
      }

      const contact = contactResult.rows[0];

      if (!contact.phone) {
        client.release();
        return res.status(400).json({ error: 'Contact does not have a phone number' });
      }

      let message, templateName, templateId = null;

      if (template_id) {
        // Get template
        const templateResult = await client.query(
          'SELECT * FROM sms_templates WHERE id = $1 AND organization_id = $2',
          [template_id, req.organizationId]
        );

        if (templateResult.rows.length === 0) {
          client.release();
          return res.status(404).json({ error: 'SMS template not found' });
        }

        const template = templateResult.rows[0];
        templateId = template.id;
        templateName = template.name;

        // Prepare SMS content with variable substitution
        const content = smsService.prepareSmsContent(template, contact);
        message = content.message;
      } else {
        // Use custom message with variable substitution
        const contactData = {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'there',
          email: contact.email || '',
          phone: contact.phone || '',
          company: contact.company || '',
          ...contact.custom_fields,
        };

        message = smsService.replaceVariables(customMessage, contactData);
      }

      // Get message info
      const messageInfo = smsService.getMessageInfo(message);

      // Send SMS
      const sendResult = await smsService.sendSms({
        to: contact.phone,
        message,
      });

      if (sendResult.success || sendResult.simulated) {
        // Log to sms_logs
        await client.query(
          `INSERT INTO sms_logs 
            (organization_id, contact_id, template_id, to_phone, from_phone, message, direction, status, external_id, segments)
           VALUES ($1, $2, $3, $4, $5, $6, 'outbound', $7, $8, $9)`,
          [
            req.organizationId,
            contact.id,
            templateId,
            smsService.normalizePhoneNumber(contact.phone),
            process.env.TWILIO_PHONE_NUMBER || null,
            message,
            sendResult.success ? 'sent' : 'queued',
            sendResult.id || null,
            messageInfo.segments,
          ]
        );

        // Log activity
        await client.query(
          `INSERT INTO contact_activities (organization_id, contact_id, type, description, created_by)
           VALUES ($1, $2, 'sms', $3, $4)`,
          [
            req.organizationId,
            contact.id,
            templateName
              ? `Sent SMS using template "${templateName}"`
              : `Sent SMS message`,
            userId,
          ]
        );

        client.release();

        res.json({
          success: true,
          simulated: sendResult.simulated || false,
          message: sendResult.simulated
            ? 'SMS service not configured - SMS would have been sent'
            : 'SMS sent successfully',
          sms_id: sendResult.id,
          status: sendResult.status,
          segments: messageInfo.segments,
        });
      } else {
        // Log failed attempt
        await client.query(
          `INSERT INTO sms_logs 
            (organization_id, contact_id, template_id, to_phone, message, direction, status, error_message, segments)
           VALUES ($1, $2, $3, $4, $5, 'outbound', 'failed', $6, $7)`,
          [
            req.organizationId,
            contact.id,
            templateId,
            smsService.normalizePhoneNumber(contact.phone),
            message,
            sendResult.error,
            messageInfo.segments,
          ]
        );

        client.release();
        res.status(500).json({
          success: false,
          error: sendResult.error,
        });
      }
    } catch (error) {
      console.error('Error sending SMS to contact:', error);
      res.status(500).json({ error: 'Failed to send SMS' });
    }
  });

  /**
   * GET /api/sms-templates/message-info
   * Get message info (character count, segments, encoding)
   */
  router.post('/message-info', authenticateJWT, async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const messageInfo = smsService.getMessageInfo(message);
    res.json(messageInfo);
  });

  /**
   * POST /api/sms-templates/webhook/status
   * Twilio webhook for SMS status updates (delivery receipts)
   * This endpoint is called by Twilio when SMS status changes
   */
  router.post('/webhook/status', publicRateLimit, async (req, res) => {
    try {
      // Validate Twilio signature (if enabled)
      const twilioSignature = req.headers['x-twilio-signature'];
      if (twilioSignature && process.env.TWILIO_AUTH_TOKEN) {
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const isValid = smsService.validateWebhookSignature(twilioSignature, url, req.body);
        if (!isValid) {
          console.warn('Invalid Twilio webhook signature');
          return res.status(403).send('Invalid signature');
        }
      }

      const {
        MessageSid,
        MessageStatus,
        To,
        From,
        ErrorCode,
        ErrorMessage,
      } = req.body;

      if (!MessageSid) {
        return res.status(400).send('MessageSid required');
      }

      const client = await pool.connect();

      // Update SMS log status
      const statusMap = {
        'queued': 'queued',
        'sending': 'sending',
        'sent': 'sent',
        'delivered': 'delivered',
        'undelivered': 'undelivered',
        'failed': 'failed',
      };

      const dbStatus = statusMap[MessageStatus] || MessageStatus;

      const updateQuery = `
        UPDATE sms_logs 
        SET status = $1, 
            ${MessageStatus === 'delivered' ? 'delivered_at = CURRENT_TIMESTAMP,' : ''}
            ${MessageStatus === 'sent' ? 'sent_at = CURRENT_TIMESTAMP,' : ''}
            error_code = $2,
            error_message = $3
        WHERE external_id = $4
      `;

      await client.query(updateQuery, [
        dbStatus,
        ErrorCode || null,
        ErrorMessage || null,
        MessageSid,
      ]);

      client.release();

      // Respond to Twilio
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error processing SMS status webhook:', error);
      res.status(500).send('Error');
    }
  });

  /**
   * POST /api/sms-templates/webhook/inbound
   * Twilio webhook for incoming SMS messages
   */
  router.post('/webhook/inbound', publicRateLimit, async (req, res) => {
    try {
      // Validate Twilio signature (if enabled)
      const twilioSignature = req.headers['x-twilio-signature'];
      if (twilioSignature && process.env.TWILIO_AUTH_TOKEN) {
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const isValid = smsService.validateWebhookSignature(twilioSignature, url, req.body);
        if (!isValid) {
          console.warn('Invalid Twilio webhook signature');
          return res.status(403).send('Invalid signature');
        }
      }

      const {
        MessageSid,
        From: fromPhone,
        To: toPhone,
        Body: messageBody,
      } = req.body;

      if (!MessageSid || !fromPhone || !messageBody) {
        return res.status(400).send('Missing required fields');
      }

      const client = await pool.connect();

      // Normalize phone numbers
      const normalizedFrom = smsService.normalizePhoneNumber(fromPhone);
      const normalizedTo = smsService.normalizePhoneNumber(toPhone);

      // Try to find the contact by phone number
      // We need to find which organization this belongs to
      const contactResult = await client.query(
        `SELECT c.*, om.organization_id 
         FROM contacts c
         JOIN organization_members om ON c.organization_id = om.organization_id
         WHERE c.phone = $1 OR c.phone = $2
         LIMIT 1`,
        [normalizedFrom, fromPhone]
      );

      let contactId = null;
      let organizationId = null;
      let conversationId = null;

      if (contactResult.rows.length > 0) {
        const contact = contactResult.rows[0];
        contactId = contact.id;
        organizationId = contact.organization_id;

        // Find or create conversation
        const convResult = await client.query(
          `SELECT id FROM conversations 
           WHERE contact_id = $1 AND organization_id = $2 AND channel = 'sms'
           ORDER BY last_message_at DESC
           LIMIT 1`,
          [contactId, organizationId]
        );

        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;

          // Update conversation
          await client.query(
            `UPDATE conversations 
             SET last_message_at = CURRENT_TIMESTAMP, 
                 last_message_preview = $1,
                 unread_count = unread_count + 1,
                 status = 'open'
             WHERE id = $2`,
            [messageBody.substring(0, 100), conversationId]
          );
        } else {
          // Create new conversation
          const newConv = await client.query(
            `INSERT INTO conversations 
              (organization_id, contact_id, channel, status, last_message_at, last_message_preview, unread_count)
             VALUES ($1, $2, 'sms', 'open', CURRENT_TIMESTAMP, $3, 1)
             RETURNING id`,
            [organizationId, contactId, messageBody.substring(0, 100)]
          );
          conversationId = newConv.rows[0].id;
        }

        // Create message in conversation
        await client.query(
          `INSERT INTO messages 
            (conversation_id, organization_id, sender_type, sender_contact_id, channel, content)
           VALUES ($1, $2, 'contact', $3, 'sms', $4)`,
          [conversationId, organizationId, contactId, messageBody]
        );
      }

      // Log the incoming SMS
      await client.query(
        `INSERT INTO sms_logs 
          (organization_id, contact_id, conversation_id, to_phone, from_phone, message, direction, status, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'inbound', 'received', $7)`,
        [
          organizationId,
          contactId,
          conversationId,
          normalizedTo,
          normalizedFrom,
          messageBody,
          MessageSid,
        ]
      );

      client.release();

      // Respond to Twilio with empty TwiML (no auto-response)
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error('Error processing inbound SMS webhook:', error);
      res.status(500).send('Error');
    }
  });

  return router;
};
