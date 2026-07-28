const express = require('express');
const smsService = require('../services/smsService');
const { logger } = require('../utils/logger');
const { withTransaction } = require('../utils/db');
const { contactColumns } = require('./template-columns');

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

    if (twilioSignature && !smsService.validateWebhookSignature(twilioSignature, url, req.body)) {
        logger.warn('[Twilio webhook] Invalid signature (non-production)');
        res.status(403).send('Invalid signature');
        return false;
    }

    return true;
}

module.exports = (pool, publicRateLimit) => {
    const router = express.Router();

    router.post('/webhook/status', publicRateLimit, async (req, res) => {
        try {
            if (!verifyTwilioWebhookOrRespond(req, res)) return;

            const {
                MessageSid,
                MessageStatus,
                ErrorCode,
                ErrorMessage,
            } = req.body;

            if (!MessageSid) return res.status(400).send('MessageSid required');

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
            if (!dbStatus) return res.status(400).send('Unsupported MessageStatus');

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

            res.status(200).send(duplicate ? 'Duplicate' : 'OK');
        } catch (error) {
            console.error('Error processing SMS status webhook:', error);
            res.status(500).send('Error');
        }
    });

    router.post('/webhook/inbound', publicRateLimit, async (req, res) => {
        try {
            if (!verifyTwilioWebhookOrRespond(req, res)) return;

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

                const contactId = contactResult.rows[0].id;
                const convResult = await client.query(
                    `SELECT id FROM conversations
                     WHERE contact_id = $1 AND organization_id = $2 AND channel = 'sms'
                     ORDER BY last_message_at DESC
                     LIMIT 1`,
                    [contactId, organizationId]
                );

                let conversationId;
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

            res.type('text/xml');
            res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        } catch (error) {
            console.error('Error processing inbound SMS webhook:', error);
            res.status(500).send('Error');
        }
    });

    return router;
};

module.exports.verifyTwilioWebhookOrRespond = verifyTwilioWebhookOrRespond;
