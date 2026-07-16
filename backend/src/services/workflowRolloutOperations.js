const { randomUUID } = require('node:crypto');
const { enqueueWorkflowTrigger, workflowTriggerEventKey } = require('./workflowTriggerQueue');
const { runWorkflowSideEffectJobs } = require('../jobs/workflow-side-effect-jobs');
const {
  runWorkflowEnrollmentJobs,
  runWorkflowTriggerJobs,
} = require('../jobs/workflow-trigger-jobs');
const { workflowJobFlags } = require('../jobs/workflow-rollout-jobs');
const { withTransaction } = require('../utils/db');
const {
  assertRolloutDatabaseIdentity,
  workflowRolloutDatabaseIdentity,
} = require('./workflowRolloutIdentity');

const CANARY_CONFIRMATION = 'I_CONFIRM_STAGING_SANDBOX_DELIVERY';
const DRAIN_CONFIRMATION = 'I_CONFIRM_STAGING_DISABLE_AND_DRAIN';
const REQUIRED_OUTBOX_COLUMNS = [
  'reconciliation_required_at',
  'reconciliation_reason',
  'last_reconciled_at',
  'last_reconciliation_action',
  'last_reconciled_by',
];

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function deploymentEnvironment(environment = process.env) {
  return String(environment.WORKFLOW_ROLLOUT_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
}

function assertStagingEnvironment(environment = process.env) {
  if (deploymentEnvironment(environment) !== 'staging') {
    throw new Error('WORKFLOW_ROLLOUT_ENVIRONMENT must be exactly staging');
  }
  const deploymentLabels = [
    environment.APP_ENV,
    environment.ENVIRONMENT,
    environment.RAILWAY_ENVIRONMENT_NAME,
    environment.VERCEL_ENV,
  ].filter(Boolean);
  if (deploymentLabels.some(label => /^(prod|production)$/i.test(String(label).trim()))) {
    throw new Error('Workflow rollout commands refuse an explicitly production deployment');
  }
}

function assertCanaryConfirmation(environment = process.env) {
  if (environment.WORKFLOW_CANARY_CONFIRM !== CANARY_CONFIRMATION) {
    throw new Error(`WORKFLOW_CANARY_CONFIRM must equal ${CANARY_CONFIRMATION}`);
  }
}

function assertDrainConfirmation(environment = process.env) {
  if (environment.WORKFLOW_DRAIN_CONFIRM !== DRAIN_CONFIRMATION) {
    throw new Error(`WORKFLOW_DRAIN_CONFIRM must equal ${DRAIN_CONFIRMATION}`);
  }
}

function canaryConfiguration(environment = process.env) {
  return {
    createdByUserId: positiveInteger(
      environment.WORKFLOW_CANARY_CREATED_BY_USER_ID,
      'WORKFLOW_CANARY_CREATED_BY_USER_ID'
    ),
    organizationId: positiveInteger(
      environment.WORKFLOW_CANARY_ORGANIZATION_ID,
      'WORKFLOW_CANARY_ORGANIZATION_ID'
    ),
    recipient: String(environment.WORKFLOW_CANARY_EMAIL || '').trim().toLowerCase(),
  };
}

function validateCanaryConfiguration(environment = process.env) {
  const configuration = canaryConfiguration(environment);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.recipient)) {
    throw new Error('WORKFLOW_CANARY_EMAIL must be a valid dedicated sandbox recipient');
  }
  if (String(environment.WORKFLOW_CANARY_PROVIDER_MODE || '').toLowerCase() !== 'sandbox') {
    throw new Error('WORKFLOW_CANARY_PROVIDER_MODE must be sandbox');
  }
  if (!environment.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
  if (!environment.EMAIL_FROM) throw new Error('EMAIL_FROM is required');
  return configuration;
}

async function workflowRolloutMetrics(pool) {
  const [triggers, enrollments, sideEffects] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('queued', 'retry', 'processing'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter,
        COALESCE(EXTRACT(EPOCH FROM (
          CURRENT_TIMESTAMP - MIN(COALESCE(next_attempt_at, created_at))
            FILTER (WHERE status IN ('queued', 'retry', 'processing'))
        ))::bigint, 0)::bigint AS oldest_pending_age_seconds
      FROM workflow_triggers
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'active' AND next_action_at <= CURRENT_TIMESTAMP
        )::int AS due,
        COUNT(*) FILTER (
          WHERE status = 'failed'
        )::int AS failed
      FROM workflow_enrollments
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('queued', 'retry', 'processing'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter,
        COUNT(*) FILTER (WHERE status = 'reconciliation_required')::int
          AS reconciliation_required,
        COALESCE(EXTRACT(EPOCH FROM (
          CURRENT_TIMESTAMP - MIN(COALESCE(next_attempt_at, created_at))
            FILTER (WHERE status IN ('queued', 'retry', 'processing'))
        ))::bigint, 0)::bigint AS oldest_pending_age_seconds
      FROM workflow_side_effect_outbox
    `),
  ]);
  const normalize = row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value || 0)])
  );
  return {
    enrollments: normalize(enrollments.rows[0]),
    sideEffects: normalize(sideEffects.rows[0]),
    triggers: normalize(triggers.rows[0]),
  };
}

async function workflowRolloutPreflight(pool, {
  environment = process.env,
  requireCanary = false,
} = {}) {
  assertStagingEnvironment(environment);
  const database = assertRolloutDatabaseIdentity(environment);
  const flags = workflowJobFlags(environment);
  const maxPendingAgeSeconds = boundedInteger(
    environment.WORKFLOW_ROLLOUT_MAX_PENDING_AGE_SECONDS,
    300,
    0,
    86_400
  );
  const maxDeadLetters = boundedInteger(
    environment.WORKFLOW_ROLLOUT_MAX_DEAD_LETTERS,
    0,
    0,
    100_000
  );
  const maxReconciliationRequired = boundedInteger(
    environment.WORKFLOW_ROLLOUT_MAX_RECONCILIATION_REQUIRED,
    0,
    0,
    100_000
  );
  const [marker, columns, metrics] = await Promise.all([
    pool.query(`SELECT EXISTS (
      SELECT 1 FROM _migrations WHERE name = 'workflow_sms_reconciliation'
    ) AS present`),
    pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workflow_side_effect_outbox'
        AND column_name = ANY($1::text[])
    `, [REQUIRED_OUTBOX_COLUMNS]),
    workflowRolloutMetrics(pool),
  ]);
  const actualColumns = new Set(columns.rows.map(row => row.column_name));
  const missingColumns = REQUIRED_OUTBOX_COLUMNS.filter(column => !actualColumns.has(column));
  const blockers = [];

  if (!marker.rows[0]?.present) blockers.push('Migration workflow_sms_reconciliation is missing');
  if (missingColumns.length) blockers.push(`Missing outbox columns: ${missingColumns.join(', ')}`);
  if (metrics.triggers.dead_letter > maxDeadLetters) {
    blockers.push(`Trigger dead letters exceed ${maxDeadLetters}`);
  }
  if (metrics.sideEffects.dead_letter > maxDeadLetters) {
    blockers.push(`Side-effect dead letters exceed ${maxDeadLetters}`);
  }
  if (metrics.sideEffects.reconciliation_required > maxReconciliationRequired) {
    blockers.push(`SMS reconciliation-required rows exceed ${maxReconciliationRequired}`);
  }
  if (metrics.triggers.oldest_pending_age_seconds > maxPendingAgeSeconds) {
    blockers.push(`Oldest trigger work exceeds ${maxPendingAgeSeconds}s`);
  }
  if (metrics.sideEffects.oldest_pending_age_seconds > maxPendingAgeSeconds) {
    blockers.push(`Oldest side-effect work exceeds ${maxPendingAgeSeconds}s`);
  }

  let canary = null;
  if (requireCanary) {
    if (!flags.trigger || !flags.enrollment || !flags.sideEffect) {
      blockers.push('All three workflow worker flags must be enabled for the staging canary');
    }
    try {
      const configuration = validateCanaryConfiguration(environment);
      canary = {
        createdByUserId: configuration.createdByUserId,
        organizationId: configuration.organizationId,
        providerMode: 'sandbox',
        recipientConfigured: true,
      };
    } catch (error) {
      blockers.push(error.message);
    }
  }

  return {
    blockers,
    canary,
    database,
    flags,
    metrics,
    ok: blockers.length === 0,
    thresholds: {
      maxDeadLetters,
      maxPendingAgeSeconds,
      maxReconciliationRequired,
    },
  };
}

async function seedWorkflowCanary(pool, configuration, runId) {
  return withTransaction(pool, async client => {
    const membership = await client.query(`
      SELECT organization.id
      FROM organizations organization
      JOIN organization_members member
        ON member.organization_id = organization.id
       AND member.user_id = $2
      WHERE organization.id = $1
      FOR UPDATE
    `, [configuration.organizationId, configuration.createdByUserId]);
    if (membership.rows.length === 0) {
      throw new Error('Canary creator must be a member of the selected organization');
    }

    const contact = (await client.query(`
      INSERT INTO contacts (
        organization_id, first_name, last_name, email, source,
        status, created_by
      ) VALUES ($1, 'Workflow', 'Canary', $2, 'api', 'active', $3)
      RETURNING id
    `, [
      configuration.organizationId,
      configuration.recipient,
      configuration.createdByUserId,
    ])).rows[0];
    const template = (await client.query(`
      INSERT INTO email_templates (
        organization_id, name, subject, body_html, body_text,
        category, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, 'system', $6
      )
      RETURNING id
    `, [
      configuration.organizationId,
      `[CANARY] Workflow rollout ${runId}`,
      `[CANARY] Itemize workflow rollout ${runId}`,
      `<p>Workflow rollout canary ${runId} reached provider delivery.</p>`,
      `Workflow rollout canary ${runId} reached provider delivery.`,
      configuration.createdByUserId,
    ])).rows[0];
    const workflow = (await client.query(`
      INSERT INTO workflows (
        organization_id, name, description, trigger_type,
        trigger_config, is_active, created_by
      ) VALUES (
        $1, $2, $3, 'manual', '{}'::jsonb, true, $4
      )
      RETURNING id
    `, [
      configuration.organizationId,
      `[CANARY] Workflow rollout ${runId}`,
      `Staging workflow rollout evidence ${runId}`,
      configuration.createdByUserId,
    ])).rows[0];
    const step = (await client.query(`
      INSERT INTO workflow_steps (
        workflow_id, step_order, step_type, step_config
      ) VALUES ($1, 1, 'send_email', $2::jsonb)
      RETURNING id
    `, [workflow.id, JSON.stringify({ template_id: template.id })])).rows[0];
    const trigger = await enqueueWorkflowTrigger(client, {
      contactId: contact.id,
      entityId: contact.id,
      entityType: 'workflow_canary',
      eventKey: workflowTriggerEventKey('domain', `workflow_canary:${runId}`),
      organizationId: configuration.organizationId,
      payload: { canary_run_id: runId, source: 'workflow_canary' },
      triggerType: 'manual',
      workflowId: workflow.id,
    });

    return {
      contactId: contact.id,
      stepId: step.id,
      templateId: template.id,
      triggerId: trigger.id,
      workflowId: workflow.id,
    };
  });
}

async function workflowCanaryState(pool, ids) {
  const result = await pool.query(`
    SELECT
      workflow.is_active,
      trigger.status AS trigger_status,
      enrollment.id AS enrollment_id,
      enrollment.status AS enrollment_status,
      outbox.id AS outbox_id,
      outbox.status AS outbox_status,
      outbox.attempt_count,
      outbox.provider_id,
      email_log.external_id AS email_log_external_id
    FROM workflows workflow
    JOIN workflow_triggers trigger ON trigger.id = $2
    LEFT JOIN workflow_enrollments enrollment
      ON enrollment.workflow_id = workflow.id
     AND enrollment.contact_id = $3
    LEFT JOIN workflow_side_effect_outbox outbox
      ON outbox.enrollment_id = enrollment.id
     AND outbox.step_id = $4
    LEFT JOIN email_logs email_log
      ON email_log.workflow_side_effect_id = outbox.id
    WHERE workflow.id = $1
  `, [ids.workflowId, ids.triggerId, ids.contactId, ids.stepId]);
  return result.rows[0] || null;
}

async function runWorkflowCanary(pool, {
  emailService,
  environment = process.env,
} = {}) {
  assertStagingEnvironment(environment);
  assertRolloutDatabaseIdentity(environment);
  assertCanaryConfirmation(environment);
  const preflight = await workflowRolloutPreflight(pool, {
    environment,
    requireCanary: true,
  });
  if (!preflight.ok) {
    throw new Error(`Workflow canary preflight failed: ${preflight.blockers.join('; ')}`);
  }

  const runId = randomUUID();
  const configuration = validateCanaryConfiguration(environment);
  const ids = await seedWorkflowCanary(pool, configuration, runId);
  try {
    const trigger = await runWorkflowTriggerJobs(pool, {
      batchSize: 1,
      triggerId: ids.triggerId,
    });
    const enrollmentRow = await pool.query(`
      SELECT id
      FROM workflow_enrollments
      WHERE workflow_id = $1 AND contact_id = $2
    `, [ids.workflowId, ids.contactId]);
    const enrollmentId = enrollmentRow.rows[0]?.id;
    if (!enrollmentId) throw new Error('Canary trigger did not create an enrollment');
    const enrollment = await runWorkflowEnrollmentJobs(pool, {
      batchSize: 1,
      enrollmentId,
    });
    const outboxRow = await pool.query(`
      SELECT id
      FROM workflow_side_effect_outbox
      WHERE enrollment_id = $1 AND step_id = $2
    `, [enrollmentId, ids.stepId]);
    const outboxId = outboxRow.rows[0]?.id;
    if (!outboxId) throw new Error('Canary enrollment did not create a provider intent');
    const sideEffect = await runWorkflowSideEffectJobs(pool, {
      batchSize: 1,
      emailService,
      outboxId,
    });
    const state = await workflowCanaryState(pool, ids);
    const success = state?.trigger_status === 'completed'
      && state?.enrollment_status === 'completed'
      && state?.outbox_status === 'sent'
      && state?.provider_id
      && state?.email_log_external_id;
    if (!success) {
      const error = new Error('Canary did not reach one correlated provider acceptance');
      error.canary = { ids: { ...ids, enrollmentId, outboxId }, state };
      throw error;
    }
    return {
      ids: { ...ids, enrollmentId, outboxId },
      preflight,
      runId,
      state,
      summaries: { enrollment, sideEffect, trigger },
      success: true,
    };
  } finally {
    await pool.query(`
      UPDATE workflows SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [ids.workflowId]);
    await pool.query(`
      UPDATE contacts SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [ids.contactId]);
  }
}

async function drainWorkflowSideEffects(pool, {
  environment = process.env,
  maxCycles,
  batchSize,
} = {}) {
  assertStagingEnvironment(environment);
  assertRolloutDatabaseIdentity(environment);
  assertDrainConfirmation(environment);
  const flags = workflowJobFlags(environment);
  if (flags.trigger || flags.enrollment || flags.sideEffect) {
    throw new Error('Disable all workflow worker flags in the deployment before manual drain');
  }
  const boundedBatchSize = boundedInteger(batchSize, 100, 1, 100);
  const boundedMaxCycles = boundedInteger(maxCycles, 20, 1, 100);
  const totals = {
    cancelled: 0,
    claimed: 0,
    cycles: 0,
    deadLetter: 0,
    reconciliationRequired: 0,
    retry: 0,
    sent: 0,
    stale: 0,
  };
  for (let cycle = 0; cycle < boundedMaxCycles; cycle += 1) {
    const summary = await runWorkflowSideEffectJobs(pool, {
      batchSize: boundedBatchSize,
    });
    totals.cycles += 1;
    for (const key of Object.keys(totals)) {
      if (key !== 'cycles') totals[key] += Number(summary[key] || 0);
    }
    if (summary.claimed === 0) break;
  }
  const metrics = await workflowRolloutMetrics(pool);
  return {
    drained: metrics.sideEffects.pending === 0,
    metrics,
    totals,
  };
}

module.exports = {
  CANARY_CONFIRMATION,
  DRAIN_CONFIRMATION,
  assertCanaryConfirmation,
  assertDrainConfirmation,
  assertRolloutDatabaseIdentity,
  assertStagingEnvironment,
  canaryConfiguration,
  drainWorkflowSideEffects,
  runWorkflowCanary,
  seedWorkflowCanary,
  validateCanaryConfiguration,
  workflowCanaryState,
  workflowRolloutDatabaseIdentity,
  workflowRolloutMetrics,
  workflowRolloutPreflight,
};
