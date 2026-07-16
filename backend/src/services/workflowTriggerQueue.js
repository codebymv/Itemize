const crypto = require('node:crypto');
const { normalizeWorkflowTriggerType } = require('../domain/workflowRegistry');

const WORKFLOW_TRIGGER_SOURCES = new Set(['domain', 'webhook']);

function optionalPositiveInteger(value, field) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Workflow trigger ${field} must be a positive integer`);
  }
  return parsed;
}

function workflowTriggerEventKey(source, identity) {
  const normalizedSource = String(source || '').trim().toLowerCase();
  if (!WORKFLOW_TRIGGER_SOURCES.has(normalizedSource)) {
    throw new Error(`Unsupported workflow trigger source: ${source}`);
  }
  const normalizedIdentity = String(identity || crypto.randomUUID()).trim();
  if (!normalizedIdentity || normalizedIdentity.length > 220) {
    throw new Error('Workflow trigger identity is invalid');
  }
  return `${normalizedSource}:${normalizedIdentity}`;
}

async function enqueueWorkflowTrigger(client, {
  contactId = null,
  deliveryKey = null,
  entityId = null,
  entityType = null,
  eventKey = null,
  occurredAt = null,
  organizationId,
  payload = {},
  source = 'domain',
  triggerType,
  workflowId = null,
}) {
  const normalizedTriggerType = normalizeWorkflowTriggerType(triggerType);
  if (!normalizedTriggerType) {
    throw new Error(`Unsupported workflow trigger type: ${triggerType}`);
  }
  if (!Number.isInteger(Number(organizationId)) || Number(organizationId) <= 0) {
    throw new Error('Workflow trigger organizationId is required');
  }
  if (!WORKFLOW_TRIGGER_SOURCES.has(source)) {
    throw new Error(`Unsupported workflow trigger source: ${source}`);
  }

  const stableEventKey = eventKey || workflowTriggerEventKey(source);
  const normalizedContactId = optionalPositiveInteger(contactId, 'contactId');
  const normalizedEntityId = optionalPositiveInteger(entityId, 'entityId');
  const normalizedWorkflowId = optionalPositiveInteger(workflowId, 'workflowId');
  const result = await client.query(`
    WITH inserted AS (
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
    LIMIT 1
  `, [
    normalizedWorkflowId,
    Number(organizationId),
    normalizedContactId,
    normalizedTriggerType,
    entityType,
    normalizedEntityId,
    JSON.stringify(payload || {}),
    source === 'webhook' ? String(deliveryKey || '').slice(0, 255) || null : null,
    stableEventKey,
    source,
    occurredAt,
  ]);
  if (!result.rows[0]) {
    throw new Error('Workflow trigger could not be inserted or resolved');
  }
  return result.rows[0];
}

module.exports = {
  enqueueWorkflowTrigger,
  workflowTriggerEventKey,
};
