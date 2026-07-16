/**
 * Workflows Routes
 * CRUD operations for marketing automation workflows
 * Refactored with shared middleware (Phase 5)
 * Updated with feature gating (Subscription Phase 6)
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const { redactWorkflowSideEffectError } = require('../jobs/workflow-side-effect-jobs');
const { 
    WORKFLOW_LIMITS, 
    ERROR_CODES,
    PLAN_METADATA 
} = require('../lib/subscription.constants');
const { workflowColumns, workflowStepColumns, workflowEnrollmentColumns } = require('./workflow-columns');
const {
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_TYPES,
  isWorkflowStepType,
  normalizeWorkflowTriggerType,
} = require('../domain/workflowRegistry');

const WORKFLOW_SIDE_EFFECT_STATUSES = new Set([
  'queued',
  'processing',
  'retry',
  'sent',
  'dead_letter',
  'cancelled',
  'reconciliation_required',
]);
const WORKFLOW_SIDE_EFFECT_TYPES = new Set(['email', 'sms', 'webhook']);

function positiveQueryInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function integerValue(value) {
  return Number.parseInt(value, 10) || 0;
}

function nullableIntegerValue(value) {
  return value === null || value === undefined ? null : integerValue(value);
}

function sideEffectStatusCounts(row) {
  return Object.fromEntries(
    [...WORKFLOW_SIDE_EFFECT_STATUSES].map(status => [
      status,
      integerValue(row[`${status}_count`]),
    ])
  );
}

function sideEffectTypeCounts(row) {
  return Object.fromEntries(
    [...WORKFLOW_SIDE_EFFECT_TYPES].map(type => [
      type,
      integerValue(row[`${type}_count`]),
    ])
  );
}

function operatorSideEffectRow(row) {
  return {
    id: row.id,
    enrollment_id: row.enrollment_id,
    step_id: row.step_id,
    step_order: row.step_order,
    step_type: row.step_type,
    effect_type: row.effect_type,
    status: row.status,
    attempt_count: integerValue(row.attempt_count),
    operator_retry_count: integerValue(row.operator_retry_count),
    provider_id: row.provider_id,
    last_error: row.last_error
      ? redactWorkflowSideEffectError(row.last_error)
      : null,
    next_attempt_at: row.next_attempt_at,
    lease_expires_at: row.lease_expires_at,
    cancelled_at: row.cancelled_at,
    cancellation_reason: row.cancellation_reason,
    last_operator_retry_at: row.last_operator_retry_at,
    reconciliation_required_at: row.reconciliation_required_at,
    reconciliation_reason: row.reconciliation_reason,
    last_reconciled_at: row.last_reconciled_at,
    last_reconciliation_action: row.last_reconciliation_action,
    last_reconciled_by: row.last_reconciled_by,
    created_at: row.created_at,
    sent_at: row.sent_at,
    is_due: Boolean(row.is_due),
    lease_expired: Boolean(row.lease_expired),
    age_seconds: integerValue(row.age_seconds),
    enrollment_status: row.enrollment_status,
    enrollment_current_step: nullableIntegerValue(row.enrollment_current_step),
    contact_id: row.contact_id,
    contact_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
  };
}

function validateSteps(steps) {
  if (steps === undefined) return null;
  if (!Array.isArray(steps)) return 'steps must be an array';
  const invalidStep = steps.find(step => !step || !isWorkflowStepType(step.step_type));
  if (invalidStep) return `Invalid step_type. Must be one of: ${WORKFLOW_STEP_TYPES.join(', ')}`;

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (step.step_type !== 'condition') continue;

    for (const field of ['true_branch_step', 'false_branch_step']) {
      const target = step[field];
      if (target === undefined || target === null) continue;
      if (!Number.isInteger(target) || target <= index + 1 || target > steps.length) {
        return `${field} must point to a later step within this workflow`;
      }
    }
  }

  return null;
}

function scheduledWorkflowConfig(triggerType, triggerConfig) {
  if (triggerType !== 'scheduled') {
    return {
      contactId: null,
      nextTriggerAt: null,
    };
  }

  const contactId = Number(triggerConfig?.contact_id);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    return { error: 'Scheduled workflows require a positive contact_id' };
  }

  const scheduledAt = new Date(triggerConfig?.scheduled_at);
  if (!triggerConfig?.scheduled_at || Number.isNaN(scheduledAt.getTime())) {
    return { error: 'Scheduled workflows require a valid scheduled_at timestamp' };
  }

  return {
    contactId,
    nextTriggerAt: scheduledAt.toISOString(),
  };
}

async function scheduledContactExists(client, organizationId, contactId) {
  if (contactId === null) return true;
  const result = await client.query(
    'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
    [contactId, organizationId]
  );
  return result.rows.length > 0;
}

/**
 * Create workflows routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  /**
   * Helper: Check workflow limit for organization
   * Returns { allowed: boolean, limit: number, current: number, plan: string }
   */
  async function checkWorkflowLimit(organizationId) {
    const orgResult = await pool.query(
      'SELECT plan, workflows_limit FROM organizations WHERE id = $1',
      [organizationId]
    );
    const org = orgResult.rows[0];
    const plan = org?.plan || 'starter';
    const limit = org?.workflows_limit ?? WORKFLOW_LIMITS[plan] ?? 5;
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM workflows WHERE organization_id = $1',
      [organizationId]
    );
    const current = parseInt(countResult.rows[0].count);
    
    // -1 means unlimited
    const allowed = limit === -1 || current < limit;
    
    return { allowed, limit, current, plan };
  }

  /**
   * GET /api/workflows
   * List all workflows for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { trigger_type, is_active, search } = req.query;
    const normalizedTriggerType = trigger_type
      ? normalizeWorkflowTriggerType(trigger_type)
      : null;

    if (trigger_type && !normalizedTriggerType) {
      return sendBadRequest(
        res,
        `Invalid trigger_type. Must be one of: ${WORKFLOW_TRIGGER_TYPES.join(', ')}`
      );
    }

    try {
      const result = await withDbClient(pool, async (client) => {
        let query = `
        SELECT 
          ${workflowColumns('w')},
          u.name as created_by_name,
          (SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = w.id) as step_count,
          (SELECT COUNT(*) FROM workflow_enrollments WHERE workflow_id = w.id AND status = 'active') as active_enrollments
        FROM workflows w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE w.organization_id = $1
      `;
        const params = [req.organizationId];
        let paramIndex = 2;

        if (normalizedTriggerType) {
          query += ` AND w.trigger_type = $${paramIndex}`;
          params.push(normalizedTriggerType);
          paramIndex++;
        }

        if (is_active !== undefined) {
          query += ` AND w.is_active = $${paramIndex}`;
          params.push(is_active === 'true');
          paramIndex++;
        }

        if (search) {
          query += ` AND (w.name ILIKE $${paramIndex} OR w.description ILIKE $${paramIndex})`;
          params.push(`%${search}%`);
          paramIndex++;
        }

        query += ' ORDER BY w.updated_at DESC';

        return client.query(query, params);
      });

      sendSuccess(res, {
        workflows: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching workflows:', error);
      sendError(res, 'Failed to fetch workflows');
    }
  });

  /**
   * GET /api/workflows/:id
   * Get a single workflow with its steps
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => {
        const workflowResult = await client.query(
          `SELECT 
            ${workflowColumns('w')},
            u.name as created_by_name
          FROM workflows w
          LEFT JOIN users u ON w.created_by = u.id
          WHERE w.id = $1 AND w.organization_id = $2`,
          [id, req.organizationId]
        );

        if (workflowResult.rows.length === 0) {
          return { status: 'not_found' };
        }

        const stepsResult = await client.query(
          `SELECT ${workflowStepColumns()} FROM workflow_steps
           WHERE workflow_id = $1 
           ORDER BY step_order`,
          [id]
        );

        const statsResult = await client.query(
          `SELECT 
            COUNT(*) FILTER (WHERE status = 'active') as active_count,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
            COUNT(*) as total_count
          FROM workflow_enrollments
          WHERE workflow_id = $1`,
          [id]
        );

        const workflow = workflowResult.rows[0];
        workflow.steps = stepsResult.rows;
        workflow.enrollment_stats = statsResult.rows[0];

        return { status: 'ok', workflow };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, result.workflow);
    } catch (error) {
      console.error('Error fetching workflow:', error);
      sendError(res, 'Failed to fetch workflow');
    }
  });

  /**
   * POST /api/workflows
   * Create a new workflow
   * Usage limited: workflows count based on plan
   */
  router.post('/', 
    authenticateJWT, 
    requireOrganization,
    asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { name, description, trigger_type, trigger_config, steps } = req.body;

    // Check workflow limit (inline check - gleamai pattern)
    const limitCheck = await checkWorkflowLimit(req.organizationId);
    if (!limitCheck.allowed) {
      const planName = PLAN_METADATA[limitCheck.plan]?.displayName || limitCheck.plan;
      return sendError(
        res,
        `Workflow limit reached. Your ${planName} plan allows ${limitCheck.limit} workflow(s). Please upgrade to create more.`,
        403,
        ERROR_CODES.PLAN_LIMIT_REACHED,
        {
          current: limitCheck.current,
          limit: limitCheck.limit,
          plan: limitCheck.plan
        }
      );
    }

    // Validation
    if (!name || !trigger_type) {
      return sendBadRequest(res, 'name and trigger_type are required');
    }

    const normalizedTriggerType = normalizeWorkflowTriggerType(trigger_type);
    if (!normalizedTriggerType) {
      return sendBadRequest(
        res,
        `Invalid trigger_type. Must be one of: ${WORKFLOW_TRIGGER_TYPES.join(', ')}`
      );
    }

    const stepsError = validateSteps(steps);
    if (stepsError) {
      return sendBadRequest(res, stepsError);
    }
    const schedule = scheduledWorkflowConfig(normalizedTriggerType, trigger_config || {});
    if (schedule.error) {
      return sendBadRequest(res, schedule.error);
    }

    try {
      const workflow = await withTransaction(pool, async (client) => {
        if (!await scheduledContactExists(client, req.organizationId, schedule.contactId)) {
          return { invalidScheduledContact: true };
        }
        const workflowResult = await client.query(
          `INSERT INTO workflows 
            (
              organization_id, name, description, trigger_type, trigger_config,
              scheduled_contact_id, next_trigger_at, created_by
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING ${workflowColumns()}`,
          [
            req.organizationId,
            name,
            description || null,
            normalizedTriggerType,
            JSON.stringify(trigger_config || {}),
            schedule.contactId,
            schedule.nextTriggerAt,
            userId,
          ]
        );

        const createdWorkflow = workflowResult.rows[0];

        if (steps && Array.isArray(steps) && steps.length > 0) {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            await client.query(
              `INSERT INTO workflow_steps 
                (workflow_id, step_order, step_type, step_config, condition_config)
              VALUES ($1, $2, $3, $4, $5)`,
              [
                createdWorkflow.id,
                i + 1,
                step.step_type,
                JSON.stringify(step.step_config || {}),
                step.condition_config ? JSON.stringify(step.condition_config) : null,
              ]
            );
          }
        }

        const stepsResult = await client.query(
          `SELECT ${workflowStepColumns()} FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`,
          [createdWorkflow.id]
        );

        createdWorkflow.steps = stepsResult.rows;
        return createdWorkflow;
      });

      if (workflow.invalidScheduledContact) {
        return sendBadRequest(res, 'scheduled contact_id must belong to the active organization');
      }
      sendCreated(res, workflow);
    } catch (error) {
      console.error('Error creating workflow:', error);
      sendError(res, 'Failed to create workflow');
    }
  }));

  /**
   * PUT /api/workflows/:id
   * Update a workflow
   */
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { name, description, trigger_type, trigger_config, steps } = req.body;
    const normalizedTriggerType = trigger_type === undefined
      ? undefined
      : normalizeWorkflowTriggerType(trigger_type);

    if (trigger_type !== undefined && !normalizedTriggerType) {
      return sendBadRequest(
        res,
        `Invalid trigger_type. Must be one of: ${WORKFLOW_TRIGGER_TYPES.join(', ')}`
      );
    }
    const stepsError = validateSteps(steps);
    if (stepsError) {
      return sendBadRequest(res, stepsError);
    }

    try {
      const result = await withTransaction(pool, async (client) => {
        const existing = await client.query(
          `SELECT ${workflowColumns()}
           FROM workflows
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [id, req.organizationId]
        );

        if (existing.rows.length === 0) {
          return { status: 'not_found' };
        }

        const workflow = existing.rows[0];
        const effectiveTriggerType = normalizedTriggerType !== undefined
          ? normalizedTriggerType
          : workflow.trigger_type;
        const effectiveTriggerConfig = trigger_config !== undefined
          ? trigger_config
          : workflow.trigger_config;
        const proposedSchedule = scheduledWorkflowConfig(
          effectiveTriggerType,
          effectiveTriggerConfig
        );
        if (proposedSchedule.error) {
          return { status: 'invalid_schedule', error: proposedSchedule.error };
        }
        const existingDefinition = scheduledWorkflowConfig(
          workflow.trigger_type,
          workflow.trigger_config
        );
        const triggerTypeChanged = normalizedTriggerType !== undefined
          && normalizedTriggerType !== workflow.trigger_type;
        const scheduleDefinitionChanged = triggerTypeChanged
          || (
            trigger_config !== undefined
            && (
              proposedSchedule.contactId !== existingDefinition.contactId
              || proposedSchedule.nextTriggerAt !== existingDefinition.nextTriggerAt
            )
          )
          || (
            effectiveTriggerType === 'scheduled'
            && !workflow.next_trigger_at
            && !workflow.last_triggered_at
          );
        const schedule = scheduleDefinitionChanged
          ? proposedSchedule
          : {
            contactId: workflow.scheduled_contact_id,
            nextTriggerAt: workflow.next_trigger_at,
          };
        if (!await scheduledContactExists(client, req.organizationId, schedule.contactId)) {
          return {
            status: 'invalid_schedule',
            error: 'scheduled contact_id must belong to the active organization',
          };
        }

        const updateResult = await client.query(
          `UPDATE workflows 
           SET name = $1,
               description = $2,
               trigger_type = $3,
               trigger_config = $4,
               scheduled_contact_id = $5,
               next_trigger_at = $6,
               last_triggered_at = CASE WHEN $7::boolean THEN NULL ELSE last_triggered_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8 AND organization_id = $9
           RETURNING ${workflowColumns()}`,
          [
            name !== undefined ? name : workflow.name,
            description !== undefined ? description : workflow.description,
            effectiveTriggerType,
            JSON.stringify(effectiveTriggerConfig),
            schedule.contactId,
            schedule.nextTriggerAt,
            scheduleDefinitionChanged,
            id,
            req.organizationId,
          ]
        );

        if (steps && Array.isArray(steps)) {
          await client.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [id]);

          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            await client.query(
              `INSERT INTO workflow_steps 
                (workflow_id, step_order, step_type, step_config, condition_config)
              VALUES ($1, $2, $3, $4, $5)`,
              [
                id,
                i + 1,
                step.step_type,
                JSON.stringify(step.step_config || {}),
                step.condition_config ? JSON.stringify(step.condition_config) : null,
              ]
            );
          }
        }

        const stepsResult = await client.query(
          `SELECT ${workflowStepColumns()} FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`,
          [id]
        );

        const updatedWorkflow = updateResult.rows[0];
        updatedWorkflow.steps = stepsResult.rows;
        return { status: 'ok', workflow: updatedWorkflow };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
      }
      if (result.status === 'invalid_schedule') {
        return sendBadRequest(res, result.error);
      }

      sendSuccess(res, result.workflow);
    } catch (error) {
      console.error('Error updating workflow:', error);
      sendError(res, 'Failed to update workflow');
    }
  });

  /**
   * DELETE /api/workflows/:id
   * Delete a workflow
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => {
        return client.query(
          'DELETE FROM workflows WHERE id = $1 AND organization_id = $2 RETURNING id',
          [id, req.organizationId]
        );
      });

      if (result.rows.length === 0) {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, { deleted_id: result.rows[0].id });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      sendError(res, 'Failed to delete workflow');
    }
  });

  /**
   * POST /api/workflows/:id/activate
   * Activate a workflow
   */
  router.post('/:id/activate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withTransaction(pool, async (client) => {
        const workflowCheck = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM workflow_steps ws WHERE ws.workflow_id = w.id
           ) AS has_steps,
           w.trigger_type,
           w.scheduled_contact_id,
           w.next_trigger_at
           FROM workflows w
           WHERE w.id = $1 AND w.organization_id = $2`,
          [id, req.organizationId]
        );

        if (workflowCheck.rows.length === 0) {
          return { status: 'not_found' };
        }

        if (!workflowCheck.rows[0].has_steps) {
          return { status: 'no_steps' };
        }
        if (
          workflowCheck.rows[0].trigger_type === 'scheduled'
          && (
            !workflowCheck.rows[0].scheduled_contact_id
            || !workflowCheck.rows[0].next_trigger_at
          )
        ) {
          return { status: 'invalid_schedule' };
        }

        const updateResult = await client.query(
          `UPDATE workflows 
           SET is_active = true, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2
           RETURNING ${workflowColumns()}`,
          [id, req.organizationId]
        );

        const resumed = await client.query(`
          UPDATE workflow_enrollments
          SET status = 'active',
              pause_reason = NULL,
              paused_at = NULL,
              execution_claim_token = NULL,
              execution_lease_expires_at = NULL,
              next_action_at = COALESCE(next_action_at, CURRENT_TIMESTAMP)
          WHERE workflow_id = $1
            AND status = 'paused'
            AND pause_reason = 'workflow_deactivated'
          RETURNING id
        `, [id]);

        return {
          status: 'ok',
          result: updateResult,
          resumedEnrollments: resumed.rows.length,
        };
      });

      if (result.status === 'no_steps') {
        return sendBadRequest(res, 'Workflow must have at least one step before activation');
      }

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
      }
      if (result.status === 'invalid_schedule') {
        return sendBadRequest(
          res,
          'Scheduled workflow requires a tenant-owned contact and scheduled timestamp'
        );
      }

      if (result.result.rows.length === 0) {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, {
        ...result.result.rows[0],
        resumed_enrollments: result.resumedEnrollments,
      });
    } catch (error) {
      console.error('Error activating workflow:', error);
      sendError(res, 'Failed to activate workflow');
    }
  });

  /**
   * POST /api/workflows/:id/deactivate
   * Deactivate a workflow
   */
  router.post('/:id/deactivate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withTransaction(pool, async (client) => {
        const workflow = await client.query(
          `UPDATE workflows 
           SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2
           RETURNING ${workflowColumns()}`,
          [id, req.organizationId]
        );
        if (workflow.rows.length === 0) return { status: 'not_found' };

        const paused = await client.query(`
          UPDATE workflow_enrollments
          SET status = 'paused',
              pause_reason = 'workflow_deactivated',
              paused_at = CURRENT_TIMESTAMP,
              execution_claim_token = NULL,
              execution_lease_expires_at = NULL
          WHERE workflow_id = $1 AND status = 'active'
          RETURNING id
        `, [id]);

        return {
          status: 'ok',
          workflow: workflow.rows[0],
          pausedEnrollments: paused.rows.length,
        };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, {
        ...result.workflow,
        paused_enrollments: result.pausedEnrollments,
      });
    } catch (error) {
      console.error('Error deactivating workflow:', error);
      sendError(res, 'Failed to deactivate workflow');
    }
  });

  /**
   * POST /api/workflows/:id/enroll
   * Manually enroll a contact in a workflow
   */
  router.post('/:id/enroll', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { contact_id, trigger_data } = req.body;

    if (!contact_id) {
      return sendBadRequest(res, 'contact_id is required');
    }

    try {
      const result = await withTransaction(pool, async (client) => {
        const workflowCheck = await client.query(
          `SELECT ${workflowColumns()} FROM workflows
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [id, req.organizationId]
        );

        if (workflowCheck.rows.length === 0) {
          return { status: 'workflow_not_found' };
        }

        const contactCheck = await client.query(
          'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
          [contact_id, req.organizationId]
        );

        if (contactCheck.rows.length === 0) {
          return { status: 'contact_not_found' };
        }

        const existingEnrollment = await client.query(
          `SELECT ${workflowEnrollmentColumns()} FROM workflow_enrollments WHERE workflow_id = $1 AND contact_id = $2`,
          [id, contact_id]
        );

        if (existingEnrollment.rows.length > 0) {
          const enrollment = existingEnrollment.rows[0];
          if (enrollment.status === 'active' || enrollment.status === 'paused') {
            return { status: 'already_enrolled' };
          }

          const updateResult = await client.query(
            `UPDATE workflow_enrollments 
             SET status = 'active', current_step = 1, enrolled_at = CURRENT_TIMESTAMP, 
                 trigger_data = $1, context = '{}', error_message = NULL, completed_at = NULL,
                 next_action_at = CURRENT_TIMESTAMP, execution_attempt_count = 0,
                 execution_claim_token = NULL, execution_lease_expires_at = NULL,
                 pause_reason = NULL, paused_at = NULL
             WHERE id = $2
             RETURNING ${workflowEnrollmentColumns()}`,
            [JSON.stringify(trigger_data || {}), enrollment.id]
          );

          return { status: 'ok', enrollment: updateResult.rows[0], created: false };
        }

        const insertResult = await client.query(
          `INSERT INTO workflow_enrollments 
            (workflow_id, contact_id, trigger_data, status, current_step, next_action_at)
          VALUES ($1, $2, $3, 'active', 1, CURRENT_TIMESTAMP)
          RETURNING ${workflowEnrollmentColumns()}`,
          [id, contact_id, JSON.stringify(trigger_data || {})]
        );

        await client.query(
          `UPDATE workflows 
           SET stats = jsonb_set(stats, '{enrolled}', ((stats->>'enrolled')::int + 1)::text::jsonb)
           WHERE id = $1`,
          [id]
        );

        return { status: 'ok', enrollment: insertResult.rows[0], created: true };
      });

      if (result.status === 'workflow_not_found') {
        return sendNotFound(res, 'Workflow');
      }
      if (result.status === 'contact_not_found') {
        return sendNotFound(res, 'Contact');
      }
      if (result.status === 'already_enrolled') {
        return sendBadRequest(res, 'Contact is already enrolled in this workflow');
      }

      sendSuccess(res, result.enrollment, result.created ? 201 : 200);
    } catch (error) {
      console.error('Error enrolling contact:', error);
      sendError(res, 'Failed to enroll contact');
    }
  });

  /**
   * GET /api/workflows/:id/enrollments
   * Get enrollments for a workflow
   */
  router.get('/:id/enrollments', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    try {
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const result = await withDbClient(pool, async (client) => {
        let query = `
        SELECT 
          ${workflowEnrollmentColumns('we')},
          c.first_name, c.last_name, c.email, c.company
        FROM workflow_enrollments we
        JOIN contacts c ON we.contact_id = c.id
        JOIN workflows w ON we.workflow_id = w.id
        WHERE we.workflow_id = $1 AND w.organization_id = $2
      `;
        let countQuery = `
        SELECT COUNT(*) as total
        FROM workflow_enrollments we
        JOIN contacts c ON we.contact_id = c.id
        JOIN workflows w ON we.workflow_id = w.id
        WHERE we.workflow_id = $1 AND w.organization_id = $2
      `;
        const params = [id, req.organizationId];
        let paramIndex = 3;

        if (status) {
          query += ` AND we.status = $${paramIndex}`;
          countQuery += ` AND we.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }

        const countResult = await client.query(
          countQuery,
          params
        );
        const total = parseInt(countResult.rows[0].total);

        query += ` ORDER BY we.enrolled_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const enrollmentsResult = await client.query(query, params);
        return { enrollments: enrollmentsResult.rows, total };
      });

      sendSuccess(res, {
        enrollments: result.enrollments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching enrollments:', error);
      sendError(res, 'Failed to fetch enrollments');
    }
  });

  /**
   * GET /api/workflows/:id/execution-summary
   * Tenant-scoped queue and enrollment metrics without provider payloads.
   */
  router.get('/:id/execution-summary', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async client => {
        const workflow = await client.query(
          'SELECT id FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );
        if (workflow.rows.length === 0) return { status: 'not_found' };

        const sideEffects = await client.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE outbox.status = 'queued')::int AS queued_count,
            COUNT(*) FILTER (WHERE outbox.status = 'processing')::int AS processing_count,
            COUNT(*) FILTER (WHERE outbox.status = 'retry')::int AS retry_count,
            COUNT(*) FILTER (WHERE outbox.status = 'sent')::int AS sent_count,
            COUNT(*) FILTER (WHERE outbox.status = 'dead_letter')::int AS dead_letter_count,
            COUNT(*) FILTER (WHERE outbox.status = 'cancelled')::int AS cancelled_count,
            COUNT(*) FILTER (
              WHERE outbox.status = 'reconciliation_required'
            )::int AS reconciliation_required_count,
            COUNT(*) FILTER (WHERE outbox.effect_type = 'email')::int AS email_count,
            COUNT(*) FILTER (WHERE outbox.effect_type = 'sms')::int AS sms_count,
            COUNT(*) FILTER (WHERE outbox.effect_type = 'webhook')::int AS webhook_count,
            COUNT(*) FILTER (
              WHERE outbox.status IN ('queued', 'retry')
                AND COALESCE(outbox.next_attempt_at, outbox.created_at) <= CURRENT_TIMESTAMP
            )::int AS due_count,
            COUNT(*) FILTER (
              WHERE outbox.status = 'processing'
                AND outbox.lease_expires_at <= CURRENT_TIMESTAMP
            )::int AS expired_processing_count,
            COALESCE(MAX(outbox.attempt_count), 0)::int AS max_attempt_count,
            COALESCE(SUM(outbox.attempt_count), 0)::bigint AS total_attempt_count,
            COALESCE(SUM(outbox.operator_retry_count), 0)::bigint AS operator_retry_count,
            MIN(outbox.created_at) FILTER (
              WHERE outbox.status IN (
                'queued', 'retry', 'processing', 'reconciliation_required'
              )
            ) AS oldest_pending_at,
            FLOOR(EXTRACT(EPOCH FROM (
              CURRENT_TIMESTAMP - MIN(outbox.created_at) FILTER (
                WHERE outbox.status IN (
                  'queued', 'retry', 'processing', 'reconciliation_required'
                )
              )
            )))::bigint AS oldest_pending_age_seconds,
            MAX(outbox.last_operator_retry_at) AS last_operator_retry_at,
            MAX(outbox.created_at) FILTER (
              WHERE outbox.status = 'dead_letter'
            ) AS latest_dead_letter_at
          FROM workflow_side_effect_outbox outbox
          JOIN workflow_enrollments enrollment ON enrollment.id = outbox.enrollment_id
          WHERE enrollment.workflow_id = $1
            AND outbox.organization_id = $2
        `, [id, req.organizationId]);

        const enrollments = await client.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
            COUNT(*) FILTER (WHERE status = 'paused')::int AS paused_count,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
            MIN(next_action_at) FILTER (
              WHERE status = 'active' AND next_action_at IS NOT NULL
            ) AS oldest_due_at,
            FLOOR(EXTRACT(EPOCH FROM (
              CURRENT_TIMESTAMP - MIN(next_action_at) FILTER (
                WHERE status = 'active'
                  AND next_action_at IS NOT NULL
                  AND next_action_at <= CURRENT_TIMESTAMP
              )
            )))::bigint AS oldest_due_age_seconds
          FROM workflow_enrollments
          WHERE workflow_id = $1
        `, [id]);

        return {
          status: 'ok',
          sideEffects: sideEffects.rows[0],
          enrollments: enrollments.rows[0],
        };
      });

      if (result.status === 'not_found') return sendNotFound(res, 'Workflow');

      const sideEffects = result.sideEffects;
      const enrollments = result.enrollments;
      return sendSuccess(res, {
        workflow_id: integerValue(id),
        side_effects: {
          total: integerValue(sideEffects.total),
          by_status: sideEffectStatusCounts(sideEffects),
          by_type: sideEffectTypeCounts(sideEffects),
          due_count: integerValue(sideEffects.due_count),
          expired_processing_count: integerValue(sideEffects.expired_processing_count),
          max_attempt_count: integerValue(sideEffects.max_attempt_count),
          total_attempt_count: integerValue(sideEffects.total_attempt_count),
          operator_retry_count: integerValue(sideEffects.operator_retry_count),
          oldest_pending_at: sideEffects.oldest_pending_at,
          oldest_pending_age_seconds: nullableIntegerValue(
            sideEffects.oldest_pending_age_seconds
          ),
          last_operator_retry_at: sideEffects.last_operator_retry_at,
          latest_dead_letter_at: sideEffects.latest_dead_letter_at,
        },
        enrollments: {
          total: integerValue(enrollments.total),
          active: integerValue(enrollments.active_count),
          paused: integerValue(enrollments.paused_count),
          completed: integerValue(enrollments.completed_count),
          failed: integerValue(enrollments.failed_count),
          cancelled: integerValue(enrollments.cancelled_count),
          oldest_due_at: enrollments.oldest_due_at,
          oldest_due_age_seconds: nullableIntegerValue(enrollments.oldest_due_age_seconds),
        },
      });
    } catch (error) {
      console.error('Error fetching workflow execution summary:', error);
      return sendError(res, 'Failed to fetch workflow execution summary');
    }
  });

  /**
   * GET /api/workflows/:id/side-effects
   * Paginated operator projection. Payloads, destinations, headers, and keys are omitted.
   */
  router.get('/:id/side-effects', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const status = req.query.status ? String(req.query.status) : null;
    const effectType = req.query.effect_type ? String(req.query.effect_type) : null;
    const page = positiveQueryInteger(req.query.page, 1, 1_000_000);
    const limit = positiveQueryInteger(req.query.limit, 50, 100);

    if (page === null || limit === null) {
      return sendBadRequest(res, 'page and limit must be positive bounded integers');
    }
    if (status && !WORKFLOW_SIDE_EFFECT_STATUSES.has(status)) {
      return sendBadRequest(res, 'Invalid workflow side-effect status');
    }
    if (effectType && !WORKFLOW_SIDE_EFFECT_TYPES.has(effectType)) {
      return sendBadRequest(res, 'Invalid workflow side-effect type');
    }

    try {
      const result = await withDbClient(pool, async client => {
        const workflow = await client.query(
          'SELECT id FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );
        if (workflow.rows.length === 0) return { status: 'not_found' };

        const filters = [
          'enrollment.workflow_id = $1',
          'outbox.organization_id = $2',
        ];
        const params = [id, req.organizationId];
        if (status) {
          params.push(status);
          filters.push(`outbox.status = $${params.length}`);
        }
        if (effectType) {
          params.push(effectType);
          filters.push(`outbox.effect_type = $${params.length}`);
        }

        const count = await client.query(`
          SELECT COUNT(*)::int AS total
          FROM workflow_side_effect_outbox outbox
          JOIN workflow_enrollments enrollment ON enrollment.id = outbox.enrollment_id
          WHERE ${filters.join(' AND ')}
        `, params);

        const offset = (page - 1) * limit;
        const pageParams = [...params, limit, offset];
        const rows = await client.query(`
          SELECT
            outbox.id,
            outbox.enrollment_id,
            outbox.step_id,
            step.step_order,
            step.step_type,
            outbox.effect_type,
            outbox.status,
            outbox.attempt_count,
            outbox.next_attempt_at,
            outbox.lease_expires_at,
            outbox.last_error,
            outbox.provider_id,
            outbox.cancelled_at,
            outbox.cancellation_reason,
            outbox.operator_retry_count,
            outbox.last_operator_retry_at,
            outbox.reconciliation_required_at,
            outbox.reconciliation_reason,
            outbox.last_reconciled_at,
            outbox.last_reconciliation_action,
            outbox.last_reconciled_by,
            outbox.created_at,
            outbox.sent_at,
            enrollment.status AS enrollment_status,
            enrollment.current_step AS enrollment_current_step,
            contact.id AS contact_id,
            contact.first_name,
            contact.last_name,
            (
              outbox.status IN ('queued', 'retry')
              AND COALESCE(outbox.next_attempt_at, outbox.created_at) <= CURRENT_TIMESTAMP
            ) AS is_due,
            (
              outbox.status = 'processing'
              AND outbox.lease_expires_at <= CURRENT_TIMESTAMP
            ) AS lease_expired,
            GREATEST(
              0,
              FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - outbox.created_at)))
            )::bigint AS age_seconds
          FROM workflow_side_effect_outbox outbox
          JOIN workflow_enrollments enrollment ON enrollment.id = outbox.enrollment_id
          LEFT JOIN workflow_steps step ON step.id = outbox.step_id
          LEFT JOIN contacts contact ON contact.id = enrollment.contact_id
          WHERE ${filters.join(' AND ')}
          ORDER BY outbox.created_at DESC, outbox.id DESC
          LIMIT $${pageParams.length - 1}
          OFFSET $${pageParams.length}
        `, pageParams);

        return {
          status: 'ok',
          total: integerValue(count.rows[0].total),
          rows: rows.rows,
        };
      });

      if (result.status === 'not_found') return sendNotFound(res, 'Workflow');

      return sendSuccess(res, {
        side_effects: result.rows.map(operatorSideEffectRow),
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching workflow side effects:', error);
      return sendError(res, 'Failed to fetch workflow side effects');
    }
  });

  /**
   * POST /api/workflows/:id/enrollments/:enrollmentId/pause
   * Explicitly pause an active enrollment. Workflow activation does not resume it.
   */
  router.post('/:id/enrollments/:enrollmentId/pause', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const result = await withDbClient(pool, client => client.query(
        `UPDATE workflow_enrollments we
         SET status = 'paused',
             pause_reason = 'manual',
             paused_at = CURRENT_TIMESTAMP,
             execution_claim_token = NULL,
             execution_lease_expires_at = NULL
         WHERE we.id = $1
           AND we.workflow_id = $2
           AND we.status = 'active'
           AND EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = we.workflow_id AND w.organization_id = $3
           )
         RETURNING ${workflowEnrollmentColumns('we')}`,
        [enrollmentId, id, req.organizationId]
      ));

      if (result.rows.length === 0) return sendNotFound(res, 'Active enrollment');
      return sendSuccess(res, result.rows[0]);
    } catch (error) {
      console.error('Error pausing enrollment:', error);
      return sendError(res, 'Failed to pause enrollment');
    }
  });

  /**
   * POST /api/workflows/:id/enrollments/:enrollmentId/resume
   * Resume only an explicitly paused enrollment while its workflow is active.
   */
  router.post('/:id/enrollments/:enrollmentId/resume', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const result = await withDbClient(pool, client => client.query(
        `UPDATE workflow_enrollments we
         SET status = 'active',
             pause_reason = NULL,
             paused_at = NULL,
             next_action_at = COALESCE(next_action_at, CURRENT_TIMESTAMP),
             execution_claim_token = NULL,
             execution_lease_expires_at = NULL
         WHERE we.id = $1
           AND we.workflow_id = $2
           AND we.status = 'paused'
           AND we.pause_reason = 'manual'
           AND EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = we.workflow_id
               AND w.organization_id = $3
               AND w.is_active = true
           )
         RETURNING ${workflowEnrollmentColumns('we')}`,
        [enrollmentId, id, req.organizationId]
      ));

      if (result.rows.length === 0) {
        return sendBadRequest(
          res,
          'Enrollment is not manually paused or its workflow is inactive'
        );
      }
      return sendSuccess(res, result.rows[0]);
    } catch (error) {
      console.error('Error resuming enrollment:', error);
      return sendError(res, 'Failed to resume enrollment');
    }
  });

  /**
   * POST /api/workflows/:id/enrollments/:enrollmentId/retry
   * Retry the failed current step without restarting completed steps.
   */
  router.post('/:id/enrollments/:enrollmentId/retry', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const result = await withDbClient(pool, client => client.query(
        `UPDATE workflow_enrollments we
         SET status = 'active',
             error_message = NULL,
             completed_at = NULL,
             next_action_at = CURRENT_TIMESTAMP,
             execution_attempt_count = 0,
             execution_claim_token = NULL,
             execution_lease_expires_at = NULL,
             pause_reason = NULL,
             paused_at = NULL
         WHERE we.id = $1
           AND we.workflow_id = $2
           AND we.status = 'failed'
           AND EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = we.workflow_id
               AND w.organization_id = $3
               AND w.is_active = true
           )
         RETURNING ${workflowEnrollmentColumns('we')}`,
        [enrollmentId, id, req.organizationId]
      ));

      if (result.rows.length === 0) {
        return sendBadRequest(res, 'Enrollment is not failed or its workflow is inactive');
      }
      return sendSuccess(res, result.rows[0]);
    } catch (error) {
      console.error('Error retrying enrollment:', error);
      return sendError(res, 'Failed to retry enrollment');
    }
  });

  /**
   * POST /api/workflows/:id/side-effects/:sideEffectId/retry
   * Operator retry for a dead letter. Attempt count restarts; retry history is retained.
   */
  router.post('/:id/side-effects/:sideEffectId/retry', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, sideEffectId } = req.params;

    try {
      const result = await withDbClient(pool, client => client.query(`
        UPDATE workflow_side_effect_outbox outbox
        SET status = 'retry',
            attempt_count = 0,
            next_attempt_at = CURRENT_TIMESTAMP,
            lease_expires_at = NULL,
            operator_retry_count = operator_retry_count + 1,
            last_operator_retry_at = CURRENT_TIMESTAMP
        WHERE outbox.id = $1
          AND outbox.status = 'dead_letter'
          AND outbox.cancelled_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM workflow_enrollments enrollment
            JOIN workflows workflow ON workflow.id = enrollment.workflow_id
            WHERE enrollment.id = outbox.enrollment_id
              AND workflow.id = $2
              AND workflow.organization_id = $3
              AND enrollment.status <> 'cancelled'
          )
        RETURNING
          id, enrollment_id, step_id, effect_type, status, attempt_count,
          operator_retry_count, next_attempt_at, last_operator_retry_at
      `, [sideEffectId, id, req.organizationId]));

      if (result.rows.length === 0) {
        return sendBadRequest(res, 'Side effect is not a retryable dead letter');
      }
      return sendSuccess(res, result.rows[0]);
    } catch (error) {
      console.error('Error retrying workflow side effect:', error);
      return sendError(res, 'Failed to retry workflow side effect');
    }
  });

  /**
   * POST /api/workflows/:id/side-effects/:sideEffectId/reconcile
   * Resolve an SMS attempt whose provider outcome is unknown after lease expiry.
   */
  router.post('/:id/side-effects/:sideEffectId/reconcile', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, sideEffectId } = req.params;
    const action = String(req.body?.action || '');
    const providerId = typeof req.body?.provider_id === 'string'
      ? req.body.provider_id.trim()
      : '';

    if (!['accepted', 'resend'].includes(action)) {
      return sendBadRequest(res, 'action must be accepted or resend');
    }
    if (action === 'accepted' && !/^SM[0-9a-fA-F]{32}$/.test(providerId)) {
      return sendBadRequest(res, 'provider_id must be a valid Twilio message SID');
    }

    try {
      const result = await withTransaction(pool, async client => {
        const workflow = await client.query(
          'SELECT id FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );
        if (workflow.rows.length === 0) return { status: 'not_found' };

        const selected = await client.query(`
          SELECT outbox.*
          FROM workflow_side_effect_outbox outbox
          JOIN workflow_enrollments enrollment ON enrollment.id = outbox.enrollment_id
          WHERE outbox.id = $1
            AND enrollment.workflow_id = $2
            AND outbox.organization_id = $3
            AND outbox.effect_type = 'sms'
            AND outbox.status = 'reconciliation_required'
            AND outbox.cancelled_at IS NULL
          FOR UPDATE OF outbox
        `, [sideEffectId, id, req.organizationId]);
        if (selected.rows.length === 0) return { status: 'not_reconcilable' };

        const sideEffect = selected.rows[0];
        if (action === 'resend') {
          const updated = await client.query(`
            UPDATE workflow_side_effect_outbox
            SET status = 'retry',
                next_attempt_at = CURRENT_TIMESTAMP,
                lease_expires_at = NULL,
                last_error = NULL,
                operator_retry_count = operator_retry_count + 1,
                last_operator_retry_at = CURRENT_TIMESTAMP,
                last_reconciled_at = CURRENT_TIMESTAMP,
                last_reconciliation_action = 'resend',
                last_reconciled_by = $2
            WHERE id = $1
            RETURNING
              id, effect_type, status, attempt_count, operator_retry_count,
              next_attempt_at, reconciliation_required_at, reconciliation_reason,
              last_reconciled_at, last_reconciliation_action, last_reconciled_by
          `, [sideEffectId, req.user.id]);
          return { status: 'ok', sideEffect: updated.rows[0] };
        }

        const updated = await client.query(`
          UPDATE workflow_side_effect_outbox
          SET status = 'sent',
              provider_id = $2,
              sent_at = CURRENT_TIMESTAMP,
              next_attempt_at = NULL,
              lease_expires_at = NULL,
              last_error = NULL,
              last_reconciled_at = CURRENT_TIMESTAMP,
              last_reconciliation_action = 'accepted',
              last_reconciled_by = $3
          WHERE id = $1
          RETURNING
            id, effect_type, status, attempt_count, operator_retry_count,
            provider_id, sent_at, reconciliation_required_at,
            reconciliation_reason, last_reconciled_at,
            last_reconciliation_action, last_reconciled_by
        `, [sideEffectId, providerId, req.user.id]);

        const payload = sideEffect.payload || {};
        await client.query(`
          INSERT INTO sms_logs (
            organization_id, contact_id, template_id, workflow_enrollment_id,
            workflow_side_effect_id, to_phone, from_phone, message, direction,
            status, external_id, segments, metadata, sent_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, 'outbound',
            'sent', $9, $10, $11::jsonb, CURRENT_TIMESTAMP
          )
          ON CONFLICT (workflow_side_effect_id)
            WHERE workflow_side_effect_id IS NOT NULL
          DO UPDATE SET
            status = 'sent',
            external_id = EXCLUDED.external_id,
            error_code = NULL,
            error_message = NULL,
            metadata = EXCLUDED.metadata,
            sent_at = EXCLUDED.sent_at
        `, [
          sideEffect.organization_id,
          payload.contactId || null,
          payload.templateId || null,
          sideEffect.enrollment_id,
          sideEffect.id,
          payload.to,
          payload.from || null,
          payload.message,
          providerId,
          payload.segments || 1,
          JSON.stringify({ reconciliation_action: 'accepted' }),
        ]);
        return { status: 'ok', sideEffect: updated.rows[0] };
      });

      if (result.status === 'not_found') return sendNotFound(res, 'Workflow');
      if (result.status === 'not_reconcilable') {
        return sendBadRequest(res, 'Side effect does not require SMS reconciliation');
      }
      return sendSuccess(res, result.sideEffect);
    } catch (error) {
      console.error('Error reconciling workflow SMS side effect:', error);
      return sendError(res, 'Failed to reconcile workflow SMS side effect');
    }
  });

  /**
   * DELETE /api/workflows/:id/enrollments/:enrollmentId
   * Cancel an enrollment
   */
  router.delete('/:id/enrollments/:enrollmentId', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const result = await withTransaction(pool, async (client) => {
        const enrollment = await client.query(
          `UPDATE workflow_enrollments we
           SET status = 'cancelled',
               completed_at = CURRENT_TIMESTAMP,
               next_action_at = NULL,
               execution_claim_token = NULL,
               execution_lease_expires_at = NULL
           WHERE we.id = $1 AND we.workflow_id = $2
             AND EXISTS (
               SELECT 1 FROM workflows w
               WHERE w.id = we.workflow_id AND w.organization_id = $3
             )
           RETURNING ${workflowEnrollmentColumns('we')}`,
          [enrollmentId, id, req.organizationId]
        );
        if (enrollment.rows.length === 0) return { status: 'not_found' };

        const sideEffects = await client.query(`
          UPDATE workflow_side_effect_outbox
          SET status = CASE
                WHEN status = 'processing' THEN status
                ELSE 'cancelled'
              END,
              cancelled_at = CURRENT_TIMESTAMP,
              cancellation_reason = 'enrollment_cancelled',
              next_attempt_at = CASE
                WHEN status = 'processing' THEN next_attempt_at
                ELSE NULL
              END,
              lease_expires_at = CASE
                WHEN status = 'processing' THEN lease_expires_at
                ELSE NULL
              END
          WHERE enrollment_id = $1
            AND status IN (
              'queued', 'retry', 'processing', 'dead_letter',
              'reconciliation_required'
            )
          RETURNING status
        `, [enrollmentId]);

        return {
          status: 'ok',
          enrollment: enrollment.rows[0],
          affectedSideEffects: sideEffects.rows.length,
        };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Enrollment');
      }

      sendSuccess(res, {
        ...result.enrollment,
        affected_side_effects: result.affectedSideEffects,
      });
    } catch (error) {
      console.error('Error cancelling enrollment:', error);
      sendError(res, 'Failed to cancel enrollment');
    }
  });

  /**
   * POST /api/workflows/:id/duplicate
   * Duplicate a workflow
   * Usage limited: workflows count based on plan
   */
  router.post('/:id/duplicate', 
    authenticateJWT, 
    requireOrganization, 
    asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check workflow limit (inline check - gleamai pattern)
    const limitCheck = await checkWorkflowLimit(req.organizationId);
    if (!limitCheck.allowed) {
      const planName = PLAN_METADATA[limitCheck.plan]?.displayName || limitCheck.plan;
      return sendError(
        res,
        `Workflow limit reached. Your ${planName} plan allows ${limitCheck.limit} workflow(s). Please upgrade to create more.`,
        403,
        ERROR_CODES.PLAN_LIMIT_REACHED,
        {
          current: limitCheck.current,
          limit: limitCheck.limit,
          plan: limitCheck.plan
        }
      );
    }

    try {
      const result = await withTransaction(pool, async (client) => {
        const originalWorkflow = await client.query(
          `SELECT ${workflowColumns()} FROM workflows WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (originalWorkflow.rows.length === 0) {
          return { status: 'not_found' };
        }

        const workflow = originalWorkflow.rows[0];

        const originalSteps = await client.query(
          `SELECT ${workflowStepColumns()} FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`,
          [id]
        );

        const newWorkflow = await client.query(
          `INSERT INTO workflows 
            (organization_id, name, description, trigger_type, trigger_config, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, false, $6)
          RETURNING ${workflowColumns()}`,
          [
            req.organizationId,
            `${workflow.name} (Copy)`,
            workflow.description,
            workflow.trigger_type,
            JSON.stringify(workflow.trigger_config),
            userId,
          ]
        );

        const newWorkflowId = newWorkflow.rows[0].id;

        for (const step of originalSteps.rows) {
          await client.query(
            `INSERT INTO workflow_steps 
              (workflow_id, step_order, step_type, step_config, condition_config)
            VALUES ($1, $2, $3, $4, $5)`,
            [
              newWorkflowId,
              step.step_order,
              step.step_type,
              JSON.stringify(step.step_config),
              step.condition_config ? JSON.stringify(step.condition_config) : null,
            ]
          );
        }

        const stepsResult = await client.query(
          `SELECT ${workflowStepColumns()} FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order`,
          [newWorkflowId]
        );

        const duplicatedWorkflow = newWorkflow.rows[0];
        duplicatedWorkflow.steps = stepsResult.rows;

        return { status: 'ok', workflow: duplicatedWorkflow };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
      }

      sendCreated(res, result.workflow);
    } catch (error) {
      console.error('Error duplicating workflow:', error);
      sendError(res, 'Failed to duplicate workflow');
    }
  }));

  return router;
};
