const express = require('express');
const { withTransaction } = require('../../utils/db');
const { logger } = require('../../utils/logger');
const {
  claimMetaMessagingEvents,
  normalizeMetaMessagingEvent,
  processMetaWebhookEventByKey,
  verifyMetaChallenge,
  verifyMetaSignature,
} = require('../../services/socialWebhookService');

function boundedInlineLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 10;
}

function emitProcessedMessage(io, result) {
  if (!io || result.status !== 'processed') return;
  io.to(`org-social-${result.channel.organization_id}`).emit('social_message', {
    conversation_id: result.conversationId,
    message: result.message,
    is_new_conversation: result.isNewConversation,
  });
}

module.exports = (pool, io, publicRateLimit, options = {}) => {
  const router = express.Router();
  const limit = publicRateLimit || ((_req, _res, next) => next());
  const claimEvents = options.claimEvents || claimMetaMessagingEvents;
  const processClaim = options.processClaim || processMetaWebhookEventByKey;
  const verifyChallenge = options.verifyChallenge || verifyMetaChallenge;
  const verifySignature = options.verifySignature || verifyMetaSignature;
  const inlineLimit = boundedInlineLimit(
    options.inlineLimit ?? process.env.META_WEBHOOK_INLINE_LIMIT
  );
  const jsonParser = express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      if (!req.rawBody) req.rawBody = Buffer.from(buffer);
    },
  });

  router.get('/webhook', limit, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (!mode || !token || typeof challenge !== 'string') return res.sendStatus(400);

    try {
      if (!verifyChallenge({
        mode,
        token,
        configuredToken: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
      })) return res.sendStatus(403);
    } catch (error) {
      if (error.code === 'WEBHOOK_NOT_CONFIGURED') {
        logger.error('[Meta webhook] Verify token is not configured');
        return res.sendStatus(503);
      }
      throw error;
    }

    return res.status(200).send(challenge);
  });

  router.post('/webhook', limit, jsonParser, async (req, res) => {
    try {
      verifySignature({
        rawBody: req.rawBody,
        signature: req.get('x-hub-signature-256'),
      });
    } catch (error) {
      if (error.code === 'WEBHOOK_NOT_CONFIGURED') {
        logger.error('[Meta webhook] App secret is not configured');
        return res.sendStatus(503);
      }
      logger.warn('[Meta webhook] Signature verification failed', { reason: error.message });
      return res.sendStatus(401);
    }

    let body;
    try {
      body = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }
    if (!['page', 'instagram'].includes(body.object)) return res.sendStatus(404);

    const channelType = body.object === 'instagram' ? 'instagram' : 'facebook';
    const normalizedEvents = [];
    try {
      for (const entry of body.entry || []) {
        for (const messagingEvent of entry.messaging || []) {
          if (!messagingEvent?.message) continue;
          normalizedEvents.push(
            normalizeMetaMessagingEvent(entry.id, messagingEvent, channelType)
          );
        }
      }
    } catch (error) {
      if (error.message.startsWith('Invalid social ')) return res.sendStatus(400);
      logger.error('[Meta webhook] Normalization failed', { error: error.message });
      return res.sendStatus(500);
    }

    let claimedEventKeys;
    try {
      claimedEventKeys = await withTransaction(
        pool,
        client => claimEvents(client, normalizedEvents)
      );
    } catch (error) {
      logger.error('[Meta webhook] Durable batch claim failed', { code: error.code || 'unknown' });
      return res.sendStatus(500);
    }

    const claimedSet = new Set(claimedEventKeys);
    const inlineEventKeys = [];
    if (inlineLimit > 0) {
      for (const event of normalizedEvents) {
        if (!claimedSet.delete(event.eventKey)) continue;
        inlineEventKeys.push(event.eventKey);
        if (inlineEventKeys.length >= inlineLimit) break;
      }
    }

    for (const eventKey of inlineEventKeys) {
      let result;
      try {
        result = await withTransaction(pool, client => processClaim(client, eventKey));
      } catch (error) {
        // The claim is already durable. Leave it queued for the leased worker rather
        // than forcing Meta to redeliver the entire batch.
        logger.warn('[Meta webhook] Inline processing deferred', {
          code: error.code || 'unknown',
        });
        continue;
      }
      try {
        emitProcessedMessage(io, result);
      } catch {
        logger.warn('[Meta webhook] Post-commit socket delivery failed');
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  });

  return router;
};

module.exports.emitProcessedMessage = emitProcessedMessage;
