const {
  AutomationEngine,
  claimWorkflowEnrollment,
} = require('../services/automationEngine');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
  enqueueWorkflowTrigger,
  workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');
const { withDbClient, withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_ENROLLMENT_BATCH_SIZE = 50;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function workflowTriggerBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactWorkflowTriggerError(error) {
  return String(error?.message || error || 'Workflow trigger processing failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+\d{7,15}\b/g, '[redacted-phone]')
    .replace(/\b(?:re|sk|whsec|AC|SK)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

function triggerWorkerOptions(workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(
      workerOptions.baseDelayMs,
      DEFAULT_BASE_DELAY_MS,
      1,
      DEFAULT_MAX_DELAY_MS
    ),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(
      workerOptions.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      1,
      DEFAULT_MAX_DELAY_MS
    ),
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  return options;
}

async function claimWorkflowTrigger(
  pool,
  leaseSeconds = DEFAULT_LEASE_SECONDS,
  triggerId = null
) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM workflow_triggers
        WHERE ($2::integer IS NULL OR id = $2)
          AND (
            (
              status IN ('queued', 'retry')
              AND COALESCE(next_attempt_at, created_at) <= CURRENT_TIMESTAMP
            ) OR (
              status = 'processing'
              AND lease_expires_at <= CURRENT_TIMESTAMP
            )
          )
        ORDER BY COALESCE(next_attempt_at, created_at), created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE workflow_triggers trigger SET
        status = 'processing',
        attempt_count = attempt_count + 1,
        lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      FROM candidate
      WHERE trigger.id = candidate.id
      RETURNING trigger.*
    `, [leaseSeconds, triggerId]);
    return result.rows[0] || null;
  });
}

async function activateEnrollment(client, workflowId, contactId, triggerData) {
  const existing = await client.query(`
    SELECT id, status
    FROM workflow_enrollments
    WHERE workflow_id = $1 AND contact_id = $2
    FOR UPDATE
  `, [workflowId, contactId]);

  if (existing.rows.length > 0) {
    const enrollment = existing.rows[0];
    if (enrollment.status === 'active' || enrollment.status === 'paused') {
      return { activated: false, status: enrollment.status };
    }
    await client.query(`
      UPDATE workflow_enrollments SET
        status = 'active',
        current_step = 1,
        trigger_data = $1::jsonb,
        context = '{}'::jsonb,
        error_message = NULL,
        enrolled_at = CURRENT_TIMESTAMP,
        next_action_at = CURRENT_TIMESTAMP,
        completed_at = NULL,
        execution_attempt_count = 0,
        execution_claim_token = NULL,
        execution_lease_expires_at = NULL,
        pause_reason = NULL,
        paused_at = NULL
      WHERE id = $2
    `, [JSON.stringify(triggerData), enrollment.id]);
  } else {
    await client.query(`
      INSERT INTO workflow_enrollments (
        workflow_id, contact_id, current_step, status,
        trigger_data, context, enrolled_at, next_action_at
      ) VALUES (
        $1, $2, 1, 'active', $3::jsonb, '{}'::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `, [workflowId, contactId, JSON.stringify(triggerData)]);
  }

  await client.query(`
    UPDATE workflows
    SET stats = jsonb_set(
      COALESCE(stats, '{}'::jsonb),
      '{enrolled}',
      to_jsonb(COALESCE((stats->>'enrolled')::integer, 0) + 1),
      true
    )
    WHERE id = $1
  `, [workflowId]);
  return { activated: true, status: 'active' };
}

async function completeWorkflowTrigger(client, claim, result) {
  const updated = await client.query(`
    UPDATE workflow_triggers SET
      status = 'completed',
      result = $3::jsonb,
      processed_at = CURRENT_TIMESTAMP,
      next_attempt_at = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
    RETURNING id
  `, [claim.id, claim.attempt_count, JSON.stringify(result)]);
  return updated.rows.length > 0;
}

async function processWorkflowTriggerClaim(pool, claim, dependencies = {}) {
  const engine = dependencies.engine || new AutomationEngine(pool);
  return withTransaction(pool, async client => {
    const current = await client.query(`
      SELECT *
      FROM workflow_triggers
      WHERE id = $1
        AND status = 'processing'
        AND attempt_count = $2
      FOR UPDATE
    `, [claim.id, claim.attempt_count]);
    if (current.rows.length === 0) return { stale: true };

    const event = current.rows[0];
    if (!event.contact_id) {
      const result = {
        enrolled: 0,
        matchedWorkflows: 0,
        skippedReason: 'contact_not_provided',
      };
      return {
        ...result,
        persisted: await completeWorkflowTrigger(client, claim, result),
      };
    }

    const contact = await client.query(`
      SELECT id
      FROM contacts
      WHERE id = $1 AND organization_id = $2
    `, [event.contact_id, event.organization_id]);
    if (contact.rows.length === 0) {
      const result = {
        enrolled: 0,
        matchedWorkflows: 0,
        skippedReason: 'contact_not_found',
      };
      return {
        ...result,
        persisted: await completeWorkflowTrigger(client, claim, result),
      };
    }

    const workflows = await client.query(`
      SELECT id, trigger_config
      FROM workflows
      WHERE organization_id = $1
        AND trigger_type = $2
        AND is_active = true
        AND ($3::integer IS NULL OR id = $3)
      ORDER BY id
      FOR UPDATE
    `, [event.organization_id, event.trigger_type, event.workflow_id]);

    const summary = {
      alreadyActive: 0,
      conditionMisses: 0,
      enrolled: 0,
      matchedWorkflows: workflows.rows.length,
      paused: 0,
    };
    const payload = event.payload || {};
    const triggerData = {
      ...payload,
      event_id: event.id,
      event_source: event.source,
      trigger_type: event.trigger_type,
    };

    for (const workflow of workflows.rows) {
      if (!engine.checkTriggerConditions(workflow.trigger_config, payload)) {
        summary.conditionMisses += 1;
        continue;
      }
      const enrollment = await activateEnrollment(
        client,
        workflow.id,
        event.contact_id,
        triggerData
      );
      if (enrollment.activated) summary.enrolled += 1;
      else if (enrollment.status === 'paused') summary.paused += 1;
      else summary.alreadyActive += 1;
    }

    return {
      ...summary,
      persisted: await completeWorkflowTrigger(client, claim, summary),
    };
  });
}

async function markWorkflowTriggerFailure(pool, claim, error, options) {
  const deadLetter = claim.attempt_count >= options.maxAttempts;
  const delayMs = workflowTriggerBackoffMs(
    claim.attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  const result = await pool.query(`
    UPDATE workflow_triggers SET
      status = $3::varchar,
      next_attempt_at = CASE
        WHEN $3::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($4::bigint * INTERVAL '1 millisecond')
      END,
      lease_expires_at = NULL,
      last_error = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
    RETURNING status
  `, [
    claim.id,
    claim.attempt_count,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactWorkflowTriggerError(error),
  ]);
  return result.rows[0]?.status || 'stale';
}

async function runWorkflowTriggerJobs(pool, workerOptions = {}) {
  const options = triggerWorkerOptions(workerOptions);
  const dependencies = {
    engine: workerOptions.engine,
  };
  const processClaim = workerOptions.processClaim
    || (claim => processWorkflowTriggerClaim(pool, claim, dependencies));
  const summary = {
    claimed: 0,
    completed: 0,
    deadLetter: 0,
    enrolled: 0,
    retry: 0,
    stale: 0,
  };

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimWorkflowTrigger(
      pool,
      options.leaseSeconds,
      workerOptions.triggerId || null
    );
    if (!claim) break;
    summary.claimed += 1;
    try {
      const result = await processClaim(claim);
      if (result?.persisted) {
        summary.completed += 1;
        summary.enrolled += result.enrolled || 0;
      } else {
        summary.stale += 1;
      }
    } catch (error) {
      const outcome = await markWorkflowTriggerFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else if (outcome === 'retry') summary.retry += 1;
      else summary.stale += 1;
      logger.warn('[Workflow trigger jobs] Processing deferred', {
        outcome,
        triggerId: claim.id,
        triggerType: claim.trigger_type,
      });
    }
  }

  return summary;
}

async function claimScheduledWorkflow(pool) {
  return withTransaction(pool, async client => {
    const due = await client.query(`
      SELECT id, organization_id, scheduled_contact_id, next_trigger_at
      FROM workflows
      WHERE trigger_type = 'scheduled'
        AND is_active = true
        AND scheduled_contact_id IS NOT NULL
        AND next_trigger_at <= CURRENT_TIMESTAMP
      ORDER BY next_trigger_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    const workflow = due.rows[0];
    if (!workflow) return null;

    const scheduledAt = new Date(workflow.next_trigger_at).toISOString();
    await client.query(`
      UPDATE workflows SET
        last_triggered_at = next_trigger_at,
        next_trigger_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [workflow.id]);

    const trigger = await enqueueWorkflowTrigger(client, {
      contactId: workflow.scheduled_contact_id,
      entityId: workflow.id,
      entityType: 'workflow',
      eventKey: workflowTriggerEventKey(
        'domain',
        `scheduled:${workflow.id}:${scheduledAt}`
      ),
      occurredAt: scheduledAt,
      organizationId: workflow.organization_id,
      payload: {
        scheduled_at: scheduledAt,
        workflow_id: workflow.id,
      },
      triggerType: WORKFLOW_TRIGGERS.SCHEDULED,
      workflowId: workflow.id,
    });

    return {
      triggerId: trigger.id,
      workflowId: workflow.id,
    };
  });
}

async function runScheduledWorkflowJobs(pool, workerOptions = {}) {
  const batchSize = boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
  const summary = {
    claimed: 0,
    queued: 0,
  };

  for (let index = 0; index < batchSize; index += 1) {
    const claim = await claimScheduledWorkflow(pool);
    if (!claim) break;
    summary.claimed += 1;
    summary.queued += 1;
  }

  return summary;
}

async function runWorkflowEnrollmentJobs(pool, workerOptions = {}) {
  const batchSize = boundedInteger(
    workerOptions.batchSize,
    DEFAULT_ENROLLMENT_BATCH_SIZE,
    1,
    100
  );
  const leaseSeconds = boundedInteger(
    workerOptions.leaseSeconds,
    DEFAULT_LEASE_SECONDS,
    1,
    3600
  );
  const engine = workerOptions.engine || new AutomationEngine(pool);
  const summary = {
    claimed: 0,
    completed: 0,
    failed: 0,
    waiting: 0,
    skipped: 0,
  };

  for (let index = 0; index < batchSize; index += 1) {
    const claim = await claimWorkflowEnrollment(pool, {
      enrollmentId: workerOptions.enrollmentId || null,
      leaseSeconds,
    });
    if (!claim) break;
    summary.claimed += 1;
    await withDbClient(pool, async client => {
      const result = await engine.processEnrollment(client, claim.id, claim);
      if (result?.completed) summary.completed += 1;
      else if (result?.waiting) summary.waiting += 1;
      else if (result?.claimed || /not found|not active/i.test(result?.error || '')) {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
      }
    });
  }
  return summary;
}

module.exports = {
  claimScheduledWorkflow,
  claimWorkflowTrigger,
  processWorkflowTriggerClaim,
  redactWorkflowTriggerError,
  runScheduledWorkflowJobs,
  runWorkflowEnrollmentJobs,
  runWorkflowTriggerJobs,
  workflowTriggerBackoffMs,
};
