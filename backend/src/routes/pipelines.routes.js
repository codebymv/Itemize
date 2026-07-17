/**
 * Pipelines Routes
 * Handles pipeline and deal management for sales CRM
 * Refactored with shared middleware (Phase 5)
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { withDbClient, withTransaction } = require('../utils/db');
const { dealColumns, pipelineColumns } = require('./pipeline-columns');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const { enqueueWorkflowTrigger } = require('../services/workflowTriggerQueue');

/**
 * Create pipelines routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  const hasStage = (stages, stageId) => (
    Array.isArray(stages) && stages.some(
      stage => String(stage.id).trim() === String(stageId)
    )
  );

  const stagesAreValid = stages => {
    if (!Array.isArray(stages) || stages.length === 0) return false;
    const ids = new Set();
    return stages.every(stage => {
      const id = typeof stage?.id === 'string' ? stage.id.trim() : '';
      const name = typeof stage?.name === 'string' ? stage.name.trim() : '';
      const color = stage?.color === undefined || stage?.color === null
        ? ''
        : String(stage.color).trim();
      if (!id || !name || id.length > 100 || name.length > 255 || color.length > 50 || ids.has(id)) {
        return false;
      }
      ids.add(id);
      return true;
    });
  };

  async function validateDealReferences(client, organizationId, {
    pipelineId,
    contactId,
    stageId,
    assignedTo,
  }) {
    const pipelineResult = await client.query(
      `SELECT p.id, p.stages,
              (
                SELECT ps.stage_key
                FROM pipeline_stages ps
                WHERE ps.pipeline_id = p.id
                ORDER BY ps.stage_order, ps.id
                LIMIT 1
              ) AS first_stage_id
       FROM pipelines p
       WHERE p.id = $1 AND p.organization_id = $2`,
      [pipelineId, organizationId]
    );
    if (pipelineResult.rows.length === 0) {
      return { status: 'pipeline_not_found' };
    }

    const pipeline = pipelineResult.rows[0];
    if (stageId !== null && stageId !== undefined) {
      const stageResult = await client.query(
        `SELECT 1
         FROM pipeline_stages
         WHERE pipeline_id = $1 AND stage_key = $2`,
        [pipeline.id, String(stageId)]
      );
      if (stageResult.rows.length === 0) {
        return { status: 'invalid_stage', pipeline };
      }
    }

    if (contactId !== null && contactId !== undefined) {
      const contactResult = await client.query(
        'SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2',
        [contactId, organizationId]
      );
      if (contactResult.rows.length === 0) {
        return { status: 'invalid_contact', pipeline };
      }
    }

    if (assignedTo !== null && assignedTo !== undefined) {
      const memberResult = await client.query(
        `SELECT 1 FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, assignedTo]
      );
      if (memberResult.rows.length === 0) {
        return { status: 'invalid_assignee', pipeline };
      }
    }

    return { status: 'ok', pipeline };
  }

  const sendDealReferenceError = (res, status) => {
    if (status === 'pipeline_not_found') {
      res.status(404).json({ error: 'Pipeline not found' });
      return true;
    }
    if (status === 'invalid_stage') {
      res.status(400).json({ error: 'stage_id must belong to the selected pipeline' });
      return true;
    }
    if (status === 'invalid_contact') {
      res.status(400).json({ error: 'contact_id must belong to the active organization' });
      return true;
    }
    if (status === 'invalid_assignee') {
      res.status(400).json({ error: 'assigned_to must be a member of the active organization' });
      return true;
    }
    return false;
  };

  // ======================
  // Pipeline Routes
  // ======================

  // Get all pipelines
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
        SELECT ${pipelineColumns('p')},
               (SELECT COUNT(*) FROM deals WHERE pipeline_id = p.id) as deal_count,
               (SELECT COALESCE(SUM(value), 0) FROM deals WHERE pipeline_id = p.id AND won_at IS NULL AND lost_at IS NULL) as total_value
        FROM pipelines p
        WHERE p.organization_id = $1
        ORDER BY p.is_default DESC, p.name ASC
      `, [req.organizationId]);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get a single pipeline with deals
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await withDbClient(pool, async (client) => {
        const pipelineResult = await client.query(
          `SELECT ${pipelineColumns()} FROM pipelines WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (pipelineResult.rows.length === 0) {
          return { status: 'not_found' };
        }

        const dealsResult = await client.query(`
          SELECT ${dealColumns('d')},
                 c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email,
                 u.name as assigned_to_name
          FROM deals d
          LEFT JOIN contacts c ON d.contact_id = c.id
          LEFT JOIN users u ON d.assigned_to = u.id
          WHERE d.pipeline_id = $1 AND d.organization_id = $2
          ORDER BY d.created_at DESC
        `, [id, req.organizationId]);

        return { status: 'ok', pipeline: pipelineResult.rows[0], deals: dealsResult.rows };
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Pipeline not found' });
      }

      res.json({
        ...result.pipeline,
        deals: result.deals
      });
    } catch (error) {
      console.error('Error fetching pipeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new pipeline
  router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { name, description, stages, is_default } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Pipeline name is required' });
      }

      if (stages !== undefined && !stagesAreValid(stages)) {
        return res.status(400).json({ error: 'stages must be a non-empty array with an id and name for every stage' });
      }

      // Default stages if none provided
      const defaultStages = stages || [
        { id: crypto.randomUUID(), name: 'Lead', order: 0, color: '#6B7280' },
        { id: crypto.randomUUID(), name: 'Qualified', order: 1, color: '#3B82F6' },
        { id: crypto.randomUUID(), name: 'Proposal', order: 2, color: '#8B5CF6' },
        { id: crypto.randomUUID(), name: 'Negotiation', order: 3, color: '#F59E0B' },
        { id: crypto.randomUUID(), name: 'Closed Won', order: 4, color: '#10B981' },
        { id: crypto.randomUUID(), name: 'Closed Lost', order: 5, color: '#EF4444' },
      ];

      const result = await withTransaction(pool, async (client) => {
        if (is_default) {
          await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);
          await client.query(
            'UPDATE pipelines SET is_default = FALSE WHERE organization_id = $1',
            [req.organizationId]
          );
        }

        return client.query(`
          INSERT INTO pipelines (organization_id, name, description, stages, is_default, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING ${pipelineColumns()}
        `, [
          req.organizationId,
          name.trim(),
          description || null,
          JSON.stringify(defaultStages),
          is_default || false,
          req.user.id
        ]);
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating pipeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update a pipeline
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, stages, is_default } = req.body;

      if (name !== undefined && (!name || name.trim().length === 0)) {
        return res.status(400).json({ error: 'Pipeline name cannot be blank' });
      }

      const result = await withTransaction(pool, async (client) => {
        const currentResult = await client.query(
          'SELECT id FROM pipelines WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [id, req.organizationId]
        );
        if (currentResult.rows.length === 0) {
          return { status: 'not_found', rows: [] };
        }

        if (stages !== undefined) {
          if (!stagesAreValid(stages)) {
            return { status: 'invalid_stages', rows: [] };
          }

          const usedStages = await client.query(
            'SELECT DISTINCT stage_id FROM deals WHERE pipeline_id = $1 AND organization_id = $2',
            [id, req.organizationId]
          );
          if (usedStages.rows.some(row => !hasStage(stages, row.stage_id))) {
            return { status: 'stage_in_use', rows: [] };
          }
        }

        if (is_default) {
          await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);
          await client.query(
            'UPDATE pipelines SET is_default = FALSE WHERE organization_id = $1 AND id != $2',
            [req.organizationId, id]
          );
        }

        const updateResult = await client.query(`
          UPDATE pipelines SET
            name = COALESCE($1, name),
            description = COALESCE($2, description),
            stages = COALESCE($3, stages),
            is_default = COALESCE($4, is_default),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $5 AND organization_id = $6
          RETURNING ${pipelineColumns()}
        `, [
          name?.trim(),
          description,
          stages ? JSON.stringify(stages) : null,
          is_default,
          id,
          req.organizationId
        ]);
        return { status: 'ok', rows: updateResult.rows };
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Pipeline not found' });
      }

      if (result.status === 'invalid_stages') {
        return res.status(400).json({ error: 'stages must be a non-empty array with an id and name for every stage' });
      }

      if (result.status === 'stage_in_use') {
        return res.status(409).json({ error: 'Cannot remove a stage that is still used by a deal' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating pipeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a pipeline
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await withTransaction(pool, async (client) => {
        const pipelineResult = await client.query(
          'SELECT id FROM pipelines WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [id, req.organizationId]
        );
        if (pipelineResult.rows.length === 0) {
          return { status: 'not_found' };
        }

        const dealCheck = await client.query(
          'SELECT COUNT(*) FROM deals WHERE pipeline_id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (parseInt(dealCheck.rows[0].count) > 0) {
          return { status: 'has_deals' };
        }

        const deleteResult = await client.query(
          'DELETE FROM pipelines WHERE id = $1 AND organization_id = $2 RETURNING id',
          [id, req.organizationId]
        );

        return { status: 'ok', result: deleteResult };
      });

      if (result.status === 'has_deals') {
        return res.status(400).json({
          error: 'Cannot delete pipeline with existing deals. Move or delete deals first.'
        });
      }

      if (result.status === 'not_found' || result.result.rows.length === 0) {
        return res.status(404).json({ error: 'Pipeline not found' });
      }

      res.json({ message: 'Pipeline deleted successfully' });
    } catch (error) {
      console.error('Error deleting pipeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ======================
  // Deal Routes
  // ======================

  // Get all deals (with filtering)
  router.get('/deals/all', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const {
        pipeline_id,
        stage_id,
        contact_id,
        assigned_to,
        status, // 'open', 'won', 'lost'
        sort_by = 'created_at',
        sort_order = 'desc',
        page = 1,
        limit = 50
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      let whereClause = 'WHERE d.organization_id = $1';
      const params = [req.organizationId];
      let paramIndex = 2;

      if (pipeline_id) {
        whereClause += ` AND d.pipeline_id = $${paramIndex}`;
        params.push(parseInt(pipeline_id));
        paramIndex++;
      }

      if (stage_id) {
        whereClause += ` AND d.stage_id = $${paramIndex}`;
        params.push(stage_id);
        paramIndex++;
      }

      if (contact_id) {
        whereClause += ` AND d.contact_id = $${paramIndex}`;
        params.push(parseInt(contact_id));
        paramIndex++;
      }

      if (assigned_to) {
        whereClause += ` AND d.assigned_to = $${paramIndex}`;
        params.push(parseInt(assigned_to));
        paramIndex++;
      }

      if (status === 'open') {
        whereClause += ' AND d.won_at IS NULL AND d.lost_at IS NULL';
      } else if (status === 'won') {
        whereClause += ' AND d.won_at IS NOT NULL';
      } else if (status === 'lost') {
        whereClause += ' AND d.lost_at IS NOT NULL';
      }

      const validSortColumns = ['created_at', 'updated_at', 'value', 'expected_close_date', 'title'];
      const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
      const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const result = await withDbClient(pool, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) FROM deals d ${whereClause}`,
          params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        const dealsResult = await client.query(`
          SELECT ${dealColumns('d')},
                 c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email, c.company as contact_company,
                 u.name as assigned_to_name,
                 p.name as pipeline_name
          FROM deals d
          LEFT JOIN contacts c ON d.contact_id = c.id
          LEFT JOIN users u ON d.assigned_to = u.id
          LEFT JOIN pipelines p ON d.pipeline_id = p.id
          ${whereClause}
          ORDER BY d.${sortColumn} ${sortDirection}
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, [...params, parseInt(limit), offset]);

        return { deals: dealsResult.rows, total: totalCount };
      });

      res.json({
        deals: result.deals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching deals:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get a single deal
  router.get('/deals/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          SELECT ${dealColumns('d')},
                 c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email, c.company as contact_company,
                 u.name as assigned_to_name,
                 p.name as pipeline_name, p.stages as pipeline_stages
          FROM deals d
          LEFT JOIN contacts c ON d.contact_id = c.id
          LEFT JOIN users u ON d.assigned_to = u.id
          LEFT JOIN pipelines p ON d.pipeline_id = p.id
          WHERE d.id = $1 AND d.organization_id = $2
        `, [id, req.organizationId]);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new deal
  router.post('/deals', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const {
        pipeline_id,
        contact_id,
        stage_id,
        title,
        value,
        currency,
        probability,
        expected_close_date,
        assigned_to,
        custom_fields,
        tags
      } = req.body;

      if (!pipeline_id) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
      }

      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Deal title is required' });
      }

      const result = await withTransaction(pool, async (client) => {
        const references = await validateDealReferences(client, req.organizationId, {
          pipelineId: pipeline_id,
          contactId: contact_id,
          stageId: stage_id,
          assignedTo: assigned_to,
        });
        if (references.status !== 'ok') {
          return references;
        }

        const dealStageId = stage_id || references.pipeline.first_stage_id;

        const insertResult = await client.query(`
          INSERT INTO deals (
            organization_id, pipeline_id, contact_id, stage_id, title,
            value, currency, probability, expected_close_date,
            assigned_to, created_by, custom_fields, tags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING ${dealColumns()}
        `, [
          req.organizationId,
          pipeline_id,
          contact_id || null,
          dealStageId,
          title.trim(),
          value || 0,
          currency || 'USD',
          probability || 0,
          expected_close_date || null,
          assigned_to || null,
          req.user.id,
          JSON.stringify(custom_fields || {}),
          tags || []
        ]);

        return { status: 'ok', deal: insertResult.rows[0] };
      });

      if (sendDealReferenceError(res, result.status)) {
        return;
      }

      res.status(201).json(result.deal);
    } catch (error) {
      console.error('Error creating deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update a deal
  router.put('/deals/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        pipeline_id,
        contact_id,
        stage_id,
        title,
        value,
        currency,
        probability,
        expected_close_date,
        assigned_to,
        custom_fields,
        tags
      } = req.body;

      const result = await withTransaction(pool, async (client) => {
        const currentResult = await client.query(
          `SELECT ${dealColumns()} FROM deals
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [id, req.organizationId]
        );
        if (currentResult.rows.length === 0) {
          return { status: 'not_found', rows: [] };
        }

        const current = currentResult.rows[0];
        const targetPipelineId = pipeline_id ?? current.pipeline_id;
        const targetStageId = stage_id ?? current.stage_id;
        const references = await validateDealReferences(client, req.organizationId, {
          pipelineId: targetPipelineId,
          contactId: contact_id,
          stageId: targetStageId,
          assignedTo: assigned_to,
        });
        if (references.status !== 'ok') {
          return { ...references, rows: [] };
        }

        const updateResult = await client.query(`
          UPDATE deals SET
            pipeline_id = COALESCE($1, pipeline_id),
            contact_id = $2,
            stage_id = COALESCE($3, stage_id),
            title = COALESCE($4, title),
            value = COALESCE($5, value),
            currency = COALESCE($6, currency),
            probability = COALESCE($7, probability),
            expected_close_date = $8,
            assigned_to = $9,
            custom_fields = COALESCE($10, custom_fields),
            tags = COALESCE($11, tags),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $12 AND organization_id = $13
          RETURNING ${dealColumns()}
        `, [
          pipeline_id,
          contact_id,
          stage_id,
          title?.trim(),
          value,
          currency,
          probability,
          expected_close_date,
          assigned_to,
          custom_fields ? JSON.stringify(custom_fields) : null,
          tags,
          id,
          req.organizationId
        ]);
        return { status: 'ok', rows: updateResult.rows };
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Deal not found' });
      }

      if (sendDealReferenceError(res, result.status)) {
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Move deal to different stage
  router.patch('/deals/:id/stage', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { stage_id } = req.body;

      if (!stage_id) {
        return res.status(400).json({ error: 'Stage ID is required' });
      }

      const result = await withTransaction(pool, async (client) => {
        const currentDeal = await client.query(
          `SELECT ${dealColumns()} FROM deals
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [id, req.organizationId]
        );

        if (currentDeal.rows.length === 0) {
          return { status: 'not_found', rows: [] };
        }

        const oldStageId = currentDeal.rows[0].stage_id;
        const references = await validateDealReferences(client, req.organizationId, {
          pipelineId: currentDeal.rows[0].pipeline_id,
          stageId: stage_id,
        });
        if (references.status !== 'ok') {
          return { ...references, rows: [] };
        }

        const updateResult = await client.query(`
          UPDATE deals SET
            stage_id = $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND organization_id = $3
          RETURNING ${dealColumns()}
        `, [stage_id, id, req.organizationId]);

        const deal = updateResult.rows[0];
        if (String(oldStageId) !== String(stage_id)) {
          await enqueueWorkflowTrigger(client, {
            contactId: deal.contact_id,
            entityId: deal.id,
            entityType: 'deal',
            organizationId: req.organizationId,
            payload: {
              deal_id: deal.id,
              newStageId: stage_id,
              oldStageId,
              pipeline_id: deal.pipeline_id,
            },
            triggerType: WORKFLOW_TRIGGERS.DEAL_STAGE_CHANGED,
          });
        }

        return { status: 'ok', rows: updateResult.rows, oldStageId };
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Deal not found' });
      }

      if (sendDealReferenceError(res, result.status)) {
        return;
      }

      const deal = result.rows[0];

      res.json(deal);
    } catch (error) {
      console.error('Error moving deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mark deal as won
  router.post('/deals/:id/won', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          UPDATE deals SET
            won_at = CURRENT_TIMESTAMP,
            lost_at = NULL,
            lost_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND organization_id = $2
          RETURNING ${dealColumns()}
        `, [id, req.organizationId]);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error marking deal as won:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mark deal as lost
  router.post('/deals/:id/lost', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          UPDATE deals SET
            lost_at = CURRENT_TIMESTAMP,
            lost_reason = $1,
            won_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND organization_id = $3
          RETURNING ${dealColumns()}
        `, [reason || null, id, req.organizationId]);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error marking deal as lost:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reopen a deal
  router.post('/deals/:id/reopen', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          UPDATE deals SET
            won_at = NULL,
            lost_at = NULL,
            lost_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND organization_id = $2
          RETURNING ${dealColumns()}
        `, [id, req.organizationId]);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error reopening deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a deal
  router.delete('/deals/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await withDbClient(pool, async (client) => {
        return client.query(
          'DELETE FROM deals WHERE id = $1 AND organization_id = $2 RETURNING id',
          [id, req.organizationId]
        );
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json({ message: 'Deal deleted successfully' });
    } catch (error) {
      console.error('Error deleting deal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
