/**
 * Email Templates Routes
 * CRUD operations for email templates
 * Refactored with shared middleware (Phase 5)
 */

const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');
const { emailTemplateColumns } = require('./template-columns');

/**
 * Create email templates routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  /**
   * GET /api/email-templates
   * List all email templates for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { category, is_active, search } = req.query;

    try {
      const result = await withDbClient(pool, async (client) => {
        let query = `
        SELECT 
          ${emailTemplateColumns('et')},
          u.name as created_by_name
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        WHERE et.organization_id = $1
      `;
        const params = [req.organizationId];
        let paramIndex = 2;

        if (category) {
          query += ` AND et.category = $${paramIndex}`;
          params.push(category);
          paramIndex++;
        }

        if (is_active !== undefined) {
          query += ` AND et.is_active = $${paramIndex}`;
          params.push(is_active === 'true');
          paramIndex++;
        }

        if (search) {
          query += ` AND (et.name ILIKE $${paramIndex} OR et.subject ILIKE $${paramIndex})`;
          params.push(`%${search}%`);
          paramIndex++;
        }

        query += ' ORDER BY et.updated_at DESC';

        return client.query(query, params);
      });

      res.json({
        templates: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching email templates:', error);
      return sendError(res, 'Failed to fetch email templates');
    }
  });

  /**
   * GET /api/email-templates/categories/list
   * Get list of template categories
   */
  router.get('/categories/list', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const result = await withDbClient(pool, async (client) => client.query(
        `SELECT DISTINCT category, COUNT(*) as count
         FROM email_templates 
         WHERE organization_id = $1
         GROUP BY category
         ORDER BY category`,
        [req.organizationId]
      ));

      res.json({
        categories: result.rows,
      });
    } catch (error) {
      console.error('Error fetching template categories:', error);
      return sendError(res, 'Failed to fetch categories');
    }
  });

  /**
   * GET /api/email-templates/:id
   * Get a single email template
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => client.query(
        `SELECT 
          ${emailTemplateColumns('et')},
          u.name as created_by_name
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        WHERE et.id = $1 AND et.organization_id = $2`,
        [id, req.organizationId]
      ));

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching email template:', error);
      return sendError(res, 'Failed to fetch email template');
    }
  });

  /**
   * POST /api/email-templates
   * Create a new email template
   */
  router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
    const userId = req.user?.id;
    const { name, subject, body_html, body_text, category, is_active } = req.body;

    // Validation
    if (!name || !subject || !body_html) {
      return res.status(400).json({
        error: 'name, subject, and body_html are required'
      });
    }

    try {
      // Extract variables from template
      const variables = [
        ...emailService.extractVariables(subject),
        ...emailService.extractVariables(body_html),
        ...(body_text ? emailService.extractVariables(body_text) : []),
      ];
      const uniqueVariables = [...new Set(variables)];

      const result = await withDbClient(pool, async (client) => client.query(
        `INSERT INTO email_templates 
          (organization_id, name, subject, body_html, body_text, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${emailTemplateColumns()}`,
        [
          req.organizationId,
          name,
          subject,
          body_html,
          body_text || null,
          JSON.stringify(uniqueVariables),
          category || 'general',
          is_active !== false,
          userId,
        ]
      ));

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating email template:', error);
      return sendError(res, 'Failed to create email template');
    }
  });

  /**
   * PUT /api/email-templates/:id
   * Update an email template
   */
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { name, subject, body_html, body_text, category, is_active } = req.body;

    try {
      const data = await withDbClient(pool, async (client) => {
        // Check template exists and belongs to org
        const existing = await client.query(
          `SELECT ${emailTemplateColumns()} FROM email_templates WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (existing.rows.length === 0) {
          return { status: 404, error: 'Email template not found' };
        }

        const template = existing.rows[0];

        // Build update values
        const finalName = name !== undefined ? name : template.name;
        const finalSubject = subject !== undefined ? subject : template.subject;
        const finalBodyHtml = body_html !== undefined ? body_html : template.body_html;
        const finalBodyText = body_text !== undefined ? body_text : template.body_text;
        const finalCategory = category !== undefined ? category : template.category;
        const finalIsActive = is_active !== undefined ? is_active : template.is_active;

        // Re-extract variables
        const variables = [
          ...emailService.extractVariables(finalSubject),
          ...emailService.extractVariables(finalBodyHtml),
          ...(finalBodyText ? emailService.extractVariables(finalBodyText) : []),
        ];
        const uniqueVariables = [...new Set(variables)];

        const result = await client.query(
          `UPDATE email_templates 
           SET name = $1, subject = $2, body_html = $3, body_text = $4, 
               variables = $5, category = $6, is_active = $7, updated_at = CURRENT_TIMESTAMP
           WHERE id = $8 AND organization_id = $9
           RETURNING ${emailTemplateColumns()}`,
          [
            finalName,
            finalSubject,
            finalBodyHtml,
            finalBodyText,
            JSON.stringify(uniqueVariables),
            finalCategory,
            finalIsActive,
            id,
            req.organizationId,
          ]
        );

        return { status: 200, result };
      });

      if (data.error) {
        return res.status(data.status).json({ error: data.error });
      }

      res.json(data.result.rows[0]);
    } catch (error) {
      console.error('Error updating email template:', error);
      return sendError(res, 'Failed to update email template');
    }
  });

  /**
   * DELETE /api/email-templates/:id
   * Delete an email template
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await withDbClient(pool, async (client) => client.query(
        'DELETE FROM email_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, req.organizationId]
      ));

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      res.json({ success: true, deleted_id: result.rows[0].id });
    } catch (error) {
      console.error('Error deleting email template:', error);
      return sendError(res, 'Failed to delete email template');
    }
  });

  /**
   * POST /api/email-templates/:id/duplicate
   * Duplicate an email template
   */
  router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
      const data = await withDbClient(pool, async (client) => {
        // Get the original template
        const original = await client.query(
          `SELECT ${emailTemplateColumns()} FROM email_templates WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (original.rows.length === 0) {
          return { status: 404, error: 'Email template not found' };
        }

        const template = original.rows[0];

        // Create duplicate with "(Copy)" suffix
        const result = await client.query(
          `INSERT INTO email_templates 
            (organization_id, name, subject, body_html, body_text, variables, category, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING ${emailTemplateColumns()}`,
          [
            req.organizationId,
            `${template.name} (Copy)`,
            template.subject,
            template.body_html,
            template.body_text,
            JSON.stringify(template.variables),
            template.category,
            false, // Start as inactive
            userId,
          ]
        );

        return { status: 201, result };
      });

      if (data.error) {
        return res.status(data.status).json({ error: data.error });
      }

      res.status(201).json(data.result.rows[0]);
    } catch (error) {
      console.error('Error duplicating email template:', error);
      return sendError(res, 'Failed to duplicate email template');
    }
  });

  return router;
};
