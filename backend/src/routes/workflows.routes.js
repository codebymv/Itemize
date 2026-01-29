/**
 * Workflows Routes
 * CRUD operations for marketing automation workflows
 * Refactored with shared middleware (Phase 5)
 * Updated with feature gating (Subscription Phase 6)
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const { 
    WORKFLOW_LIMITS, 
    ERROR_CODES,
    PLAN_METADATA 
} = require('../lib/subscription.constants');

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

    try {
      const result = await withDbClient(pool, async (client) => {
        let query = `
        SELECT 
          w.*,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = w.id) as step_count,
          (SELECT COUNT(*) FROM workflow_enrollments WHERE workflow_id = w.id AND status = 'active') as active_enrollments
        FROM workflows w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE w.organization_id = $1
      `;
        const params = [req.organizationId];
        let paramIndex = 2;

        if (trigger_type) {
          query += ` AND w.trigger_type = $${paramIndex}`;
          params.push(trigger_type);
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
            w.*,
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
          `SELECT * FROM workflow_steps 
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

    const validTriggerTypes = [
      'contact_added', 'tag_added', 'tag_removed', 'deal_stage_changed',
      'form_submitted', 'manual', 'scheduled', 'contact_updated'
    ];

    if (!validTriggerTypes.includes(trigger_type)) {
      return sendBadRequest(res, `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(', ')}`);
    }

    try {
      const workflow = await withTransaction(pool, async (client) => {
        const workflowResult = await client.query(
          `INSERT INTO workflows 
            (organization_id, name, description, trigger_type, trigger_config, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            req.organizationId,
            name,
            description || null,
            trigger_type,
            JSON.stringify(trigger_config || {}),
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
          'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
          [createdWorkflow.id]
        );

        createdWorkflow.steps = stepsResult.rows;
        return createdWorkflow;
      });

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

    try {
      const result = await withTransaction(pool, async (client) => {
        const existing = await client.query(
          'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (existing.rows.length === 0) {
          return { status: 'not_found' };
        }

        const workflow = existing.rows[0];

        const updateResult = await client.query(
          `UPDATE workflows 
           SET name = $1, description = $2, trigger_type = $3, trigger_config = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5 AND organization_id = $6
           RETURNING *`,
          [
            name !== undefined ? name : workflow.name,
            description !== undefined ? description : workflow.description,
            trigger_type !== undefined ? trigger_type : workflow.trigger_type,
            JSON.stringify(trigger_config !== undefined ? trigger_config : workflow.trigger_config),
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
          'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
          [id]
        );

        const updatedWorkflow = updateResult.rows[0];
        updatedWorkflow.steps = stepsResult.rows;
        return { status: 'ok', workflow: updatedWorkflow };
      });

      if (result.status === 'not_found') {
        return sendNotFound(res, 'Workflow');
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
      const result = await withDbClient(pool, async (client) => {
        const stepsCheck = await client.query(
          'SELECT COUNT(*) as count FROM workflow_steps WHERE workflow_id = $1',
          [id]
        );

        if (parseInt(stepsCheck.rows[0].count) === 0) {
          return { status: 'no_steps' };
        }

        const updateResult = await client.query(
          `UPDATE workflows 
           SET is_active = true, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2
           RETURNING *`,
          [id, req.organizationId]
        );

        return { status: 'ok', result: updateResult };
      });

      if (result.status === 'no_steps') {
        return sendBadRequest(res, 'Workflow must have at least one step before activation');
      }

      if (result.result.rows.length === 0) {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, result.result.rows[0]);
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
      const result = await withDbClient(pool, async (client) => {
        return client.query(
          `UPDATE workflows 
           SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2
           RETURNING *`,
          [id, req.organizationId]
        );
      });

      if (result.rows.length === 0) {
        return sendNotFound(res, 'Workflow');
      }

      sendSuccess(res, result.rows[0]);
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
      const result = await withDbClient(pool, async (client) => {
        const workflowCheck = await client.query(
          'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (workflowCheck.rows.length === 0) {
          return { status: 'workflow_not_found' };
        }

        const contactCheck = await client.query(
          'SELECT * FROM contacts WHERE id = $1 AND organization_id = $2',
          [contact_id, req.organizationId]
        );

        if (contactCheck.rows.length === 0) {
          return { status: 'contact_not_found' };
        }

        const existingEnrollment = await client.query(
          'SELECT * FROM workflow_enrollments WHERE workflow_id = $1 AND contact_id = $2',
          [id, contact_id]
        );

        if (existingEnrollment.rows.length > 0) {
          const enrollment = existingEnrollment.rows[0];
          if (enrollment.status === 'active') {
            return { status: 'already_enrolled' };
          }

          const updateResult = await client.query(
            `UPDATE workflow_enrollments 
             SET status = 'active', current_step = 1, enrolled_at = CURRENT_TIMESTAMP, 
                 trigger_data = $1, context = '{}', error_message = NULL, completed_at = NULL
             WHERE id = $2
             RETURNING *`,
            [JSON.stringify(trigger_data || {}), enrollment.id]
          );

          return { status: 'ok', enrollment: updateResult.rows[0], created: false };
        }

        const insertResult = await client.query(
          `INSERT INTO workflow_enrollments 
            (workflow_id, contact_id, trigger_data, status, current_step)
          VALUES ($1, $2, $3, 'active', 1)
          RETURNING *`,
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
          we.*,
          c.first_name, c.last_name, c.email, c.company
        FROM workflow_enrollments we
        JOIN contacts c ON we.contact_id = c.id
        JOIN workflows w ON we.workflow_id = w.id
        WHERE we.workflow_id = $1 AND w.organization_id = $2
      `;
        const params = [id, req.organizationId];
        let paramIndex = 3;

        if (status) {
          query += ` AND we.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }

        const countResult = await client.query(
          query.replace('SELECT \n          we.*,\n          c.first_name, c.last_name, c.email, c.company', 'SELECT COUNT(*) as total'),
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
   * DELETE /api/workflows/:id/enrollments/:enrollmentId
   * Cancel an enrollment
   */
  router.delete('/:id/enrollments/:enrollmentId', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => {
        return client.query(
          `UPDATE workflow_enrollments 
           SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND workflow_id = $2
           RETURNING *`,
          [enrollmentId, id]
        );
      });

      if (result.rows.length === 0) {
        return sendNotFound(res, 'Enrollment');
      }

      sendSuccess(res, result.rows[0]);
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
          'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (originalWorkflow.rows.length === 0) {
          return { status: 'not_found' };
        }

        const workflow = originalWorkflow.rows[0];

        const originalSteps = await client.query(
          'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
          [id]
        );

        const newWorkflow = await client.query(
          `INSERT INTO workflows 
            (organization_id, name, description, trigger_type, trigger_config, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, false, $6)
          RETURNING *`,
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
          'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
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
