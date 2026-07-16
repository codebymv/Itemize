/**
 * SMS Templates Routes
 * CRUD operations for SMS templates, sending SMS, and Twilio webhooks
 */

const express = require('express');
const router = express.Router();
const smsService = require('../services/smsService');
const { logger } = require('../utils/logger');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendError } = require('../utils/response');
const { contactColumns, smsTemplateColumns } = require('./template-columns');

/**
 * Twilio-signed webhooks only in production when auth token is set (unless dev bypass).
 * Set SKIP_TWILIO_WEBHOOK_VALIDATION=true in local/dev only — blocked at startup in production.
 * @returns {boolean} false if response already sent
 */
function verifyTwilioWebhookOrRespond(req, res) {
    if (process.env.SKIP_TWILIO_WEBHOOK_VALIDATION === 'true' && process.env.NODE_ENV !== 'production') {
        return true;
    }

    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('[Twilio webhook] TWILIO_AUTH_TOKEN is required in production');
            res.status(503).send('Webhook verification unavailable');
            return false;
        }
        return true;
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (process.env.NODE_ENV === 'production') {
        if (!twilioSignature) {
            logger.warn('[Twilio webhook] Missing X-Twilio-Signature');
            res.status(403).send('Forbidden');
            return false;
        }
        if (!smsService.validateWebhookSignature(twilioSignature, url, req.body)) {
            logger.warn('[Twilio webhook] Invalid signature');
            res.status(403).send('Invalid signature');
            return false;
        }
        return true;
    }

    if (twilioSignature) {
        if (!smsService.validateWebhookSignature(twilioSignature, url, req.body)) {
            logger.warn('[Twilio webhook] Invalid signature (non-production)');
            res.status(403).send('Invalid signature');
            return false;
        }
    }

    return true;
}

/**
 * Create SMS templates routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Function} publicRateLimit - Rate limiting middleware for public endpoints
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {
  const { requireOrganization } = require('../middleware/organization')(pool);

  /**
   * GET /api/sms-templates
   * List all SMS templates for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { category, is_active, search } = req.query;

    try {
      const result = await withDbClient(pool, async (client) => {
        let query = `
        SELECT 
          ${smsTemplateColumns('st')},
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

        return client.query(query, params);
      });

      res.json({
        templates: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching SMS templates:', error);
      return sendError(res, 'Failed to fetch SMS templates');
    }
  });

  /**
   * GET /api/sms-templates/categories/list
   * Get list of template categories
   */
  router.get('/categories/list', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const result = await withDbClient(pool, async (client) => client.query(
        `SELECT DISTINCT category, COUNT(*) as count
         FROM sms_templates 
         WHERE organization_id = $1
         GROUP BY category
         ORDER BY category`,
        [req.organizationId]
      ));

      res.json({
        categories: result.rows,
      });
    } catch (error) {
      console.error('Error fetching template categories:', error);
      return sendError(res, 'Failed to fetch categories');
    }
  });

  /**
   * GET /api/sms-templates/:id
   * Get a single SMS template
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => client.query(
        `SELECT 
          ${smsTemplateColumns('st')},
          u.name as created_by_name
        FROM sms_templates st
        LEFT JOIN users u ON st.created_by = u.id
        WHERE st.id = $1 AND st.organization_id = $2`,
        [id, req.organizationId]
      ));

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'SMS template not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching SMS template:', error);
      return sendError(res, 'Failed to fetch SMS template');
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

      const result = await withDbClient(pool, async (client) => client.query(
        `INSERT INTO sms_templates 
          (organization_id, name, message, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${smsTemplateColumns()}`,
        [
          req.organizationId,
          name,
          message,
          JSON.stringify(uniqueVariables),
          category || 'general',
          is_active !== false,
          userId,
        ]
      ));

      res.status(201).json({
        ...result.rows[0],
        message_info: messageInfo,
      });
    } catch (error) {
      console.error('Error creating SMS template:', error);
      return sendError(res, 'Failed to create SMS template');
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
      const data = await withDbClient(pool, async (client) => {
        // Check template exists and belongs to org
        const existing = await client.query(
          `SELECT ${smsTemplateColumns()} FROM sms_templates WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (existing.rows.length === 0) {
          return { error: 'SMS template not found', status: 404 };
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
           RETURNING ${smsTemplateColumns()}`,
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

        // Get message info
        const messageInfo = smsService.getMessageInfo(finalMessage);

        return { error: null, status: 200, result, messageInfo };
      });

      if (data.error) {
        return res.status(data.status).json({ error: data.error });
      }

      res.json({
        ...data.result.rows[0],
        message_info: data.messageInfo,
      });
    } catch (error) {
      console.error('Error updating SMS template:', error);
      return sendError(res, 'Failed to update SMS template');
    }
  });

  /**
   * DELETE /api/sms-templates/:id
   * Delete an SMS template
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const data = await withDbClient(pool, async (client) => {
        const result = await client.query(
          'DELETE FROM sms_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
          [id, req.organizationId]
        );

        if (result.rows.length === 0) {
          return { error: 'SMS template not found', status: 404 };
        }

        return { error: null, status: 200, result };
      });

      if (data.error) {
        return res.status(data.status).json({ error: data.error });
      }

      res.json({ success: true, deleted_id: data.result.rows[0].id });
    } catch (error) {
      console.error('Error deleting SMS template:', error);
      return sendError(res, 'Failed to delete SMS template');
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
      const result = await withDbClient(pool, async (client) => client.query(
        `SELECT ${smsTemplateColumns()} FROM sms_templates WHERE id = $1 AND organization_id = $2`,
        [id, req.organizationId]
      ));

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
      return sendError(res, 'Failed to send test SMS');
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
      const data = await withDbClient(pool, async (client) => {
        // Get the original template
        const original = await client.query(
          `SELECT ${smsTemplateColumns()} FROM sms_templates WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (original.rows.length === 0) {
          return { error: 'SMS template not found', status: 404 };
        }

        const template = original.rows[0];

        // Create duplicate with "(Copy)" suffix
        const result = await client.query(
          `INSERT INTO sms_templates 
            (organization_id, name, message, variables, category, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING ${smsTemplateColumns()}`,
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

        return { error: null, status: 201, result };
      });

      if (data.error) {
        return res.status(data.status).json({ error: data.error });
      }

      res.status(201).json(data.result.rows[0]);
    } catch (error) {
      console.error('Error duplicating SMS template:', error);
      return sendError(res, 'Failed to duplicate SMS template');
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
      const data = await withDbClient(pool, async (client) => {
        // Get contact
        const contactResult = await client.query(
          `SELECT ${contactColumns()} FROM contacts WHERE id = $1 AND organization_id = $2`,
          [contact_id, req.organizationId]
        );

        if (contactResult.rows.length === 0) {
          return { status: 404, payload: { error: 'Contact not found' } };
        }

        const contact = contactResult.rows[0];

        if (!contact.phone) {
          return { status: 400, payload: { error: 'Contact does not have a phone number' } };
        }

        let message, templateName, templateId = null;

        if (template_id) {
          // Get template
          const templateResult = await client.query(
            `SELECT ${smsTemplateColumns()} FROM sms_templates WHERE id = $1 AND organization_id = $2`,
            [template_id, req.organizationId]
          );

          if (templateResult.rows.length === 0) {
            return { status: 404, payload: { error: 'SMS template not found' } };
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

        if (sendResult.success) {
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
            `INSERT INTO contact_activities (contact_id, user_id, type, title, content, metadata)
             VALUES ($1, $2, 'sms', $3, $4::jsonb, $5::jsonb)`,
            [
              contact.id,
              userId,
              'SMS sent',
              JSON.stringify({
                description: templateName
                  ? `Sent SMS using template "${templateName}"`
                  : 'Sent SMS message',
              }),
              JSON.stringify({ template_id: templateId, provider_id: sendResult.id || null }),
            ]
          );

          return {
            status: 200,
            payload: {
              success: true,
              simulated: false,
              message: 'SMS sent successfully',
              sms_id: sendResult.id,
              status: sendResult.status,
              segments: messageInfo.segments,
            },
          };
        }

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

        return {
          status: sendResult.simulated ? 503 : 500,
          payload: {
            success: false,
            error: sendResult.error,
            code: sendResult.simulated ? 'SMS_PROVIDER_NOT_CONFIGURED' : 'SMS_SEND_FAILED',
          },
        };
      });

      return res.status(data.status).json(data.payload);
    } catch (error) {
      console.error('Error sending SMS to contact:', error);
      return sendError(res, 'Failed to send SMS');
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
      if (!verifyTwilioWebhookOrRespond(req, res)) {
        return;
      }

      const {
        MessageSid,
        MessageStatus,
        ErrorCode,
        ErrorMessage,
      } = req.body;

      if (!MessageSid) {
        return res.status(400).send('MessageSid required');
      }

      const statusMap = {
        accepted: 'queued',
        scheduled: 'queued',
        queued: 'queued',
        receiving: 'sending',
        sending: 'sending',
        sent: 'sent',
        delivered: 'delivered',
        read: 'delivered',
        undelivered: 'undelivered',
        canceled: 'failed',
        failed: 'failed',
      };
      const dbStatus = statusMap[MessageStatus];
      if (!dbStatus) {
        return res.status(400).send('Unsupported MessageStatus');
      }

      const duplicate = await withTransaction(pool, async (client) => {
        const claim = await client.query(
          `INSERT INTO sms_webhook_events (event_key, event_type, external_id)
           VALUES ($1, 'status', $2)
           ON CONFLICT (event_key) DO NOTHING
           RETURNING event_key`,
          [`status:${MessageSid}:${MessageStatus}`, MessageSid]
        );
        if (claim.rows.length === 0) return true;

        const updateQuery = `
          UPDATE sms_logs 
          SET status = $1, 
              ${dbStatus === 'delivered' ? 'delivered_at = CURRENT_TIMESTAMP,' : ''}
              ${dbStatus === 'sent' ? 'sent_at = CURRENT_TIMESTAMP,' : ''}
              error_code = $2,
              error_message = $3
          WHERE external_id = $4 AND direction = 'outbound'
        `;

        await client.query(updateQuery, [
          dbStatus,
          ErrorCode || null,
          ErrorMessage || null,
          MessageSid,
        ]);
        await client.query(
          `UPDATE sms_webhook_events
           SET processing_status = 'processed'
           WHERE event_key = $1`,
          [`status:${MessageSid}:${MessageStatus}`]
        );
        return false;
      });

      // Respond to Twilio
      res.status(200).send(duplicate ? 'Duplicate' : 'OK');
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
      if (!verifyTwilioWebhookOrRespond(req, res)) {
        return;
      }

      const {
        MessageSid,
        From: fromPhone,
        To: toPhone,
        Body: messageBody,
      } = req.body;

      if (!MessageSid || !fromPhone || !toPhone || !messageBody) {
        return res.status(400).send('Missing required fields');
      }

      const outcome = await withTransaction(pool, async (client) => {
        // Normalize phone numbers
        const normalizedFrom = smsService.normalizePhoneNumber(fromPhone);
        const normalizedTo = smsService.normalizePhoneNumber(toPhone);

        const claim = await client.query(
          `INSERT INTO sms_webhook_events (
             event_key, event_type, external_id, to_phone, from_phone, processing_status
           )
           VALUES ($1, 'inbound', $2, $3, $4, 'pending')
           ON CONFLICT (event_key) DO NOTHING
           RETURNING event_key`,
          [`inbound:${MessageSid}`, MessageSid, normalizedTo, normalizedFrom]
        );
        if (claim.rows.length === 0) return { duplicate: true, routed: false };

        const receiverResult = await client.query(
          `SELECT id, organization_id
           FROM sms_receiving_numbers
           WHERE phone_number = $1
             AND provider = 'twilio'
             AND is_active = TRUE
           LIMIT 1
           FOR SHARE`,
          [normalizedTo]
        );

        if (receiverResult.rows.length === 0) {
          await client.query(
            `UPDATE sms_webhook_events
             SET processing_status = 'unmatched_receiver'
             WHERE event_key = $1`,
            [`inbound:${MessageSid}`]
          );
          return {
            duplicate: false,
            routed: false,
            reason: 'unmatched_receiver',
          };
        }

        const organizationId = receiverResult.rows[0].organization_id;
        const contactResult = await client.query(
          `SELECT ${contactColumns('c')}
           FROM contacts c
           WHERE c.organization_id = $1
             AND (c.phone = $2 OR c.phone = $3)
           ORDER BY c.id
           LIMIT 2`,
          [organizationId, normalizedFrom, fromPhone]
        );

        if (contactResult.rows.length !== 1) {
          const reason = contactResult.rows.length === 0
            ? 'unmatched_sender'
            : 'ambiguous_sender';
          await client.query(
            `UPDATE sms_webhook_events
             SET organization_id = $2,
                 processing_status = $3
             WHERE event_key = $1`,
            [`inbound:${MessageSid}`, organizationId, reason]
          );
          return {
            duplicate: false,
            routed: false,
            reason,
          };
        }

        const contact = contactResult.rows[0];
        const contactId = contact.id;
        let conversationId = null;

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
          const newConv = await client.query(
            `INSERT INTO conversations
              (organization_id, contact_id, channel, status, last_message_at, last_message_preview, unread_count)
             VALUES ($1, $2, 'sms', 'open', CURRENT_TIMESTAMP, $3, 1)
             RETURNING id`,
            [organizationId, contactId, messageBody.substring(0, 100)]
          );
          conversationId = newConv.rows[0].id;
        }

        await client.query(
          `INSERT INTO messages
            (conversation_id, organization_id, sender_type, sender_contact_id, channel, content)
           VALUES ($1, $2, 'contact', $3, 'sms', $4)`,
          [conversationId, organizationId, contactId, messageBody]
        );

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

        await client.query(
          `UPDATE sms_webhook_events
           SET organization_id = $2,
               contact_id = $3,
               processing_status = 'processed'
           WHERE event_key = $1`,
          [`inbound:${MessageSid}`, organizationId, contactId]
        );

        return { duplicate: false, routed: true };
      });

      if (!outcome.routed && !outcome.duplicate) {
        logger.warn('[Twilio webhook] Inbound SMS was not tenant-routable', {
          messageSid: MessageSid,
          reason: outcome.reason,
        });
      }

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
