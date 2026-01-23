/**
 * Workflows Routes
 * CRUD operations for marketing automation workflows
 * Refactored with shared middleware (Phase 5)
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');

/**
 * Create workflows routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  /**
   * GET /api/workflows
   * List all workflows for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { trigger_type, is_active, search } = req.query;

    try {
      const client = await pool.connect();
      
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

      const result = await client.query(query, params);
      client.release();

      res.json({
        workflows: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching workflows:', error);
      res.status(500).json({ error: 'Failed to fetch workflows' });
    }
  });

  /**
   * GET /api/workflows/:id
   * Get a single workflow with its steps
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();

      // Get workflow
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
        client.release();
        return res.status(404).json({ error: 'Workflow not found' });
      }

      // Get steps
      const stepsResult = await client.query(
        `SELECT * FROM workflow_steps 
         WHERE workflow_id = $1 
         ORDER BY step_order`,
        [id]
      );

      // Get enrollment stats
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

      client.release();

      const workflow = workflowResult.rows[0];
      workflow.steps = stepsResult.rows;
      workflow.enrollment_stats = statsResult.rows[0];

      res.json(workflow);
    } catch (error) {
      console.error('Error fetching workflow:', error);
      res.status(500).json({ error: 'Failed to fetch workflow' });
    }
  });

  /**
   * POST /api/workflows
   * Create a new workflow
   */
  router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
    const userId = req.user?.id;
    const { name, description, trigger_type, trigger_config, steps } = req.body;

    // Validation
    if (!name || !trigger_type) {
      return res.status(400).json({ 
        error: 'name and trigger_type are required' 
      });
    }

    const validTriggerTypes = [
      'contact_added', 'tag_added', 'tag_removed', 'deal_stage_changed',
      'form_submitted', 'manual', 'scheduled', 'contact_updated'
    ];

    if (!validTriggerTypes.includes(trigger_type)) {
      return res.status(400).json({ 
        error: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(', ')}` 
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create workflow
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

      const workflow = workflowResult.rows[0];

      // Create steps if provided
      if (steps && Array.isArray(steps) && steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await client.query(
            `INSERT INTO workflow_steps 
              (workflow_id, step_order, step_type, step_config, condition_config)
            VALUES ($1, $2, $3, $4, $5)`,
            [
              workflow.id,
              i + 1,
              step.step_type,
              JSON.stringify(step.step_config || {}),
              step.condition_config ? JSON.stringify(step.condition_config) : null,
            ]
          );
        }
      }

      await client.query('COMMIT');

      // Fetch complete workflow with steps
      const stepsResult = await client.query(
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
        [workflow.id]
      );

      workflow.steps = stepsResult.rows;
      client.release();

      res.status(201).json(workflow);
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      console.error('Error creating workflow:', error);
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  /**
   * PUT /api/workflows/:id
   * Update a workflow
   */
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { name, description, trigger_type, trigger_config, steps } = req.body;

    const client = await pool.connect();

    try {
      // Check workflow exists
      const existing = await client.query(
        'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Workflow not found' });
      }

      const workflow = existing.rows[0];

      await client.query('BEGIN');

      // Update workflow
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

      // Update steps if provided
      if (steps && Array.isArray(steps)) {
        // Delete existing steps
        await client.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [id]);

        // Insert new steps
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

      await client.query('COMMIT');

      // Fetch updated workflow with steps
      const stepsResult = await client.query(
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
        [id]
      );

      const updatedWorkflow = updateResult.rows[0];
      updatedWorkflow.steps = stepsResult.rows;
      client.release();

      res.json(updatedWorkflow);
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      console.error('Error updating workflow:', error);
      res.status(500).json({ error: 'Failed to update workflow' });
    }
  });

  /**
   * DELETE /api/workflows/:id
   * Delete a workflow
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        'DELETE FROM workflows WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json({ success: true, deleted_id: result.rows[0].id });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      res.status(500).json({ error: 'Failed to delete workflow' });
    }
  });

  /**
   * POST /api/workflows/:id/activate
   * Activate a workflow
   */
  router.post('/:id/activate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();

      // Check workflow has at least one step
      const stepsCheck = await client.query(
        'SELECT COUNT(*) as count FROM workflow_steps WHERE workflow_id = $1',
        [id]
      );

      if (parseInt(stepsCheck.rows[0].count) === 0) {
        client.release();
        return res.status(400).json({ error: 'Workflow must have at least one step before activation' });
      }

      const result = await client.query(
        `UPDATE workflows 
         SET is_active = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error activating workflow:', error);
      res.status(500).json({ error: 'Failed to activate workflow' });
    }
  });

  /**
   * POST /api/workflows/:id/deactivate
   * Deactivate a workflow
   */
  router.post('/:id/deactivate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        `UPDATE workflows 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error deactivating workflow:', error);
      res.status(500).json({ error: 'Failed to deactivate workflow' });
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
      return res.status(400).json({ error: 'contact_id is required' });
    }

    try {
      const client = await pool.connect();

      // Check workflow exists and is active
      const workflowCheck = await client.query(
        'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (workflowCheck.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Workflow not found' });
      }

      // Check contact exists
      const contactCheck = await client.query(
        'SELECT * FROM contacts WHERE id = $1 AND organization_id = $2',
        [contact_id, req.organizationId]
      );

      if (contactCheck.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Contact not found' });
      }

      // Check if already enrolled
      const existingEnrollment = await client.query(
        'SELECT * FROM workflow_enrollments WHERE workflow_id = $1 AND contact_id = $2',
        [id, contact_id]
      );

      if (existingEnrollment.rows.length > 0) {
        const enrollment = existingEnrollment.rows[0];
        if (enrollment.status === 'active') {
          client.release();
          return res.status(400).json({ error: 'Contact is already enrolled in this workflow' });
        }

        // Re-enroll by updating existing enrollment
        const result = await client.query(
          `UPDATE workflow_enrollments 
           SET status = 'active', current_step = 1, enrolled_at = CURRENT_TIMESTAMP, 
               trigger_data = $1, context = '{}', error_message = NULL, completed_at = NULL
           WHERE id = $2
           RETURNING *`,
          [JSON.stringify(trigger_data || {}), enrollment.id]
        );
        client.release();

        return res.json(result.rows[0]);
      }

      // Create new enrollment
      const result = await client.query(
        `INSERT INTO workflow_enrollments 
          (workflow_id, contact_id, trigger_data, status, current_step)
        VALUES ($1, $2, $3, 'active', 1)
        RETURNING *`,
        [id, contact_id, JSON.stringify(trigger_data || {})]
      );

      // Update workflow stats
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{enrolled}', ((stats->>'enrolled')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [id]
      );

      client.release();

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error enrolling contact:', error);
      res.status(500).json({ error: 'Failed to enroll contact' });
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
      const client = await pool.connect();
      const offset = (parseInt(page) - 1) * parseInt(limit);

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

      // Count total
      const countResult = await client.query(
        query.replace('SELECT \n          we.*,\n          c.first_name, c.last_name, c.email, c.company', 'SELECT COUNT(*) as total'),
        params
      );
      const total = parseInt(countResult.rows[0].total);

      query += ` ORDER BY we.enrolled_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), offset);

      const result = await client.query(query, params);
      client.release();

      res.json({
        enrollments: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching enrollments:', error);
      res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
  });

  /**
   * DELETE /api/workflows/:id/enrollments/:enrollmentId
   * Cancel an enrollment
   */
  router.delete('/:id/enrollments/:enrollmentId', authenticateJWT, requireOrganization, async (req, res) => {
    const { id, enrollmentId } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        `UPDATE workflow_enrollments 
         SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND workflow_id = $2
         RETURNING *`,
        [enrollmentId, id]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Enrollment not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error cancelling enrollment:', error);
      res.status(500).json({ error: 'Failed to cancel enrollment' });
    }
  });

  /**
   * POST /api/workflows/:id/duplicate
   * Duplicate a workflow
   */
  router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    const client = await pool.connect();

    try {
      // Get original workflow
      const originalWorkflow = await client.query(
        'SELECT * FROM workflows WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (originalWorkflow.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Workflow not found' });
      }

      const workflow = originalWorkflow.rows[0];

      // Get original steps
      const originalSteps = await client.query(
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
        [id]
      );

      await client.query('BEGIN');

      // Create duplicate workflow
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

      // Duplicate steps
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

      await client.query('COMMIT');

      // Fetch complete new workflow
      const stepsResult = await client.query(
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
        [newWorkflowId]
      );

      const duplicatedWorkflow = newWorkflow.rows[0];
      duplicatedWorkflow.steps = stepsResult.rows;
      client.release();

      res.status(201).json(duplicatedWorkflow);
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      console.error('Error duplicating workflow:', error);
      res.status(500).json({ error: 'Failed to duplicate workflow' });
    }
  });

  return router;
};
