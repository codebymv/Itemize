const express = require('express');
const { Resend } = require('resend');
const { asyncHandler } = require('../middleware/errorHandler');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');
const { processEmailWebhookEvent } = require('../services/emailWebhookService');

function verifyResendWebhook({ rawBody, headers, secret = process.env.RESEND_WEBHOOK_SECRET }) {
  if (!secret) {
    const error = new Error('Resend webhook secret is not configured');
    error.code = 'WEBHOOK_NOT_CONFIGURED';
    throw error;
  }
  if (!Buffer.isBuffer(rawBody)) throw new Error('Raw webhook body is required');

  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (!id || !timestamp || !signature) throw new Error('Missing webhook signature headers');

  const resend = new Resend(process.env.RESEND_API_KEY || 're_webhook_verification_only');
  return resend.webhooks.verify({
    payload: rawBody.toString('utf8'),
    headers: { id, timestamp, signature },
    webhookSecret: secret,
  });
}

module.exports = (pool, publicRateLimit, options = {}) => {
  const router = express.Router();
  const verifyWebhook = options.verifyWebhook || verifyResendWebhook;
  const processEvent = options.processEvent || processEmailWebhookEvent;
  const limit = publicRateLimit || ((_req, _res, next) => next());

  router.post('/webhook/resend', limit, asyncHandler(async (req, res) => {
    let event;
    try {
      event = verifyWebhook({ rawBody: req.rawBody, headers: req.headers });
    } catch (error) {
      if (error.code === 'WEBHOOK_NOT_CONFIGURED') {
        logger.error('[Resend webhook] Signing secret is not configured');
        return res.status(503).json({ error: 'Webhook verification unavailable' });
      }
      logger.warn('[Resend webhook] Verification failed', { reason: error.message });
      return res.status(400).json({ error: 'Invalid webhook' });
    }

    const deliveryId = req.headers['svix-id'];
    let result;
    try {
      result = await withTransaction(
        pool,
        client => processEvent(client, deliveryId, event)
      );
    } catch (error) {
      if (error.message.startsWith('Invalid ')) {
        return res.status(400).json({ error: 'Invalid webhook event' });
      }
      throw error;
    }

    return res.status(200).json({ received: true, ...result });
  }));

  return router;
};

module.exports.verifyResendWebhook = verifyResendWebhook;
