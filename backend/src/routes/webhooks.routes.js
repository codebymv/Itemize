const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validate, webhookEvent } = require('../validators/schemas');
const { normalizeWorkflowTriggerType } = require('../domain/workflowRegistry');
const {
  enqueueWorkflowTrigger,
  workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function safeEqualHex(expected, actual) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(String(actual || ''), 'hex');
  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function verifyWorkflowWebhook(req, secret) {
  const signature = req.headers['x-itemize-signature'];
  const timestamp = req.headers['x-itemize-timestamp'];

  if (!signature || !timestamp) {
    return { ok: false, status: 401, message: 'Missing webhook signature headers' };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)
    || Math.abs(Date.now() - timestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, status: 401, message: 'Webhook timestamp is invalid or expired' };
  }

  const rawBody = req.rawBody && Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString('utf8')
    : JSON.stringify(req.body || {});
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  if (!safeEqualHex(expected, signature)) {
    return { ok: false, status: 401, message: 'Invalid webhook signature' };
  }

  return { ok: true };
}

/**
 * POST /api/webhooks/:workflowId
 *
 * Retained compatibility ingress. It verifies and durably records a matching
 * event, but intentionally does not claim that workflow steps were executed.
 */
router.post('/:workflowId', validate(webhookEvent), async (req, res) => {
  const { workflowId } = req.params;
  const { contactId, eventType, entityId, entityData = {} } = req.body;
  const normalizedEventType = normalizeWorkflowTriggerType(eventType);
  const resolvedEntityId = entityId ?? entityData?.entityId ?? null;
  const resolvedContactId = contactId ?? entityData?.contactId ?? null;

  try {
    const pool = req.dbPool;

    if (!pool) {
      return res.status(503).json({ error: 'Database connection not available' });
    }

    const workflowRes = await pool.query(`
      SELECT id, organization_id, name, trigger_type, is_active, webhook_secret
      FROM workflows
      WHERE id = $1
    `, [workflowId]);

    if (workflowRes.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = workflowRes.rows[0];
    const signatureCheck = verifyWorkflowWebhook(req, workflow.webhook_secret);
    if (!signatureCheck.ok) {
      return res.status(signatureCheck.status).json({ error: signatureCheck.message });
    }

    if (!workflow.is_active) {
      return res.status(200).json({
        success: false,
        message: 'Workflow is not active',
        workflowId,
      });
    }

    if (normalizedEventType !== workflow.trigger_type) {
      return res.status(409).json({
        success: false,
        error: 'Webhook event does not match the workflow trigger',
        expectedEventType: workflow.trigger_type,
        receivedEventType: normalizedEventType,
      });
    }

    const deliveryId = String(req.headers['x-itemize-delivery-id'] || '').trim();
    if (deliveryId.length > 200) {
      return res.status(400).json({ error: 'Webhook delivery ID is too long' });
    }
    const deliveryKey = deliveryId || `signature:${req.headers['x-itemize-signature']}`;

    logger.info('Workflow trigger received', {
      workflowId,
      eventType: normalizedEventType,
      entityId: resolvedEntityId,
    });

    const trigger = await enqueueWorkflowTrigger(pool, {
      contactId: resolvedContactId,
      deliveryKey,
      entityId: resolvedEntityId,
      entityType: entityData?.entityType || null,
      eventKey: workflowTriggerEventKey('webhook', `${workflowId}:${deliveryKey}`),
      organizationId: workflow.organization_id,
      payload: entityData,
      source: 'webhook',
      triggerType: normalizedEventType,
      workflowId: workflow.id,
    });

    if (!trigger.inserted) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Webhook delivery already recorded',
        workflowId,
      });
    }

    return res.status(202).json({
      success: true,
      accepted: true,
      triggerId: trigger.id,
      workflowId,
      eventType: normalizedEventType,
      execution: 'durably_queued',
      message: 'Trigger recorded for asynchronous workflow enrollment',
    });
  } catch (error) {
    logger.error('Webhook processing error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Processing failed',
      error: error.message,
    });
  }
});

module.exports = router;
