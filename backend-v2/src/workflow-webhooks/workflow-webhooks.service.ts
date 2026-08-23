/**
 * Faithful port of the retained workflow webhook ingress
 * (backend/src/routes/webhooks.routes.js and the webhook branch of
 * backend/src/services/workflowTriggerQueue.js). HMAC verification,
 * timestamp tolerance, canonical trigger matching, and the durable
 * delivery-key replay claim must not drift while both runtimes serve
 * the receiver.
 */
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export type WorkflowRow = {
  id: number;
  organization_id: number;
  name: string;
  trigger_type: string;
  is_active: boolean;
  webhook_secret: string;
};

export type SignatureCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

const safeEqualHex = (expected: string, actual: unknown): boolean => {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(String(actual || ''), 'hex');
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
};

export function verifyWorkflowWebhook(
  values: {
    signature: unknown;
    timestamp: unknown;
    rawBody: Buffer | undefined;
    parsedBody: unknown;
  },
  secret: string,
): SignatureCheck {
  const { signature, timestamp } = values;
  if (!signature || !timestamp) {
    return {
      ok: false,
      status: 401,
      message: 'Missing webhook signature headers',
    };
  }

  const timestampMs = Number(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS
  ) {
    return {
      ok: false,
      status: 401,
      message: 'Webhook timestamp is invalid or expired',
    };
  }

  const rawBody =
    values.rawBody && Buffer.isBuffer(values.rawBody)
      ? values.rawBody.toString('utf8')
      : JSON.stringify(values.parsedBody || {});
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, status: 401, message: 'Invalid webhook signature' };
  }
  return { ok: true };
}

@Injectable()
export class WorkflowWebhooksService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findWorkflow(workflowId: string): Promise<WorkflowRow | null> {
    const result = await this.pool.query<WorkflowRow>(
      `SELECT id, organization_id, name, trigger_type, is_active, webhook_secret
       FROM workflows
       WHERE id = $1`,
      [workflowId],
    );
    return result.rows[0] ?? null;
  }

  async enqueueWebhookTrigger(values: {
    workflowId: number;
    organizationId: number;
    contactId: number | null;
    deliveryKey: string;
    entityId: number | null;
    entityType: string | null;
    eventKey: string;
    payload: unknown;
    triggerType: string;
  }): Promise<{ id: number; inserted: boolean }> {
    const result = await this.pool.query<{
      id: number;
      inserted: boolean;
    }>(
      `WITH inserted AS (
         INSERT INTO workflow_triggers (
           workflow_id, organization_id, contact_id, trigger_type,
           entity_type, entity_id, payload, status, delivery_key,
           event_key, source, occurred_at, next_attempt_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7::jsonb, 'queued', $8,
           $9, $10, COALESCE($11::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
         )
         ON CONFLICT DO NOTHING
         RETURNING id, status, event_key, true AS inserted
       )
       SELECT id, status, event_key, inserted
       FROM inserted
       UNION ALL
       SELECT id, status, event_key, false AS inserted
       FROM workflow_triggers
       WHERE event_key = $9
          OR ($1::integer IS NOT NULL AND workflow_id = $1 AND delivery_key = $8)
       ORDER BY inserted DESC
       LIMIT 1`,
      [
        values.workflowId,
        values.organizationId,
        values.contactId,
        values.triggerType,
        values.entityType,
        values.entityId,
        JSON.stringify(values.payload || {}),
        String(values.deliveryKey || '').slice(0, 255) || null,
        values.eventKey,
        'webhook',
        null,
      ],
    );
    if (!result.rows[0]) {
      throw new Error('Workflow trigger could not be inserted or resolved');
    }
    return result.rows[0];
  }
}
