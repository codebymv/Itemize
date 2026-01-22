/**
 * Email Templates Routes
 * CRUD operations for email templates
 */

const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');

/**
 * Create email templates routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {

  /**
   * Middleware to require organization context
   */
  const requireOrganization = async (req, res, next) => {
    try {
      const organizationId = req.query.organization_id || req.body.organization_id || req.headers['x-organization-id'];
      
      if (!organizationId) {
        const client = await pool.connect();
        const result = await client.query(
          'SELECT default_organization_id FROM users WHERE id = $1',
          [req.user.id]
        );
        client.release();

        if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
          return res.status(400).json({ error: 'Organization ID required.' });
        }
        req.organizationId = result.rows[0].default_organization_id;
      } else {
        req.organizationId = parseInt(organizationId);
      }

      // Verify user has access to this organization
      const client = await pool.connect();
      const memberCheck = await client.query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [req.organizationId, req.user.id]
      );
      client.release();

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      req.orgRole = memberCheck.rows[0].role;
      next();
    } catch (error) {
      console.error('Error in requireOrganization middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /api/email-templates
   * List all email templates for an organization
   */
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    const { category, is_active, search } = req.query;

    try {
      const client = await pool.connect();
      
      let query = `
        SELECT 
          et.*,
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

      const result = await client.query(query, params);
      client.release();

      res.json({
        templates: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ error: 'Failed to fetch email templates' });
    }
  });

  /**
   * GET /api/email-templates/categories/list
   * Get list of template categories
   */
  router.get('/categories/list', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT DISTINCT category, COUNT(*) as count
         FROM email_templates 
         WHERE organization_id = $1
         GROUP BY category
         ORDER BY category`,
        [req.organizationId]
      );
      client.release();

      res.json({
        categories: result.rows,
      });
    } catch (error) {
      console.error('Error fetching template categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  /**
   * GET /api/email-templates/:id
   * Get a single email template
   */
  router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT 
          et.*,
          u.name as created_by_name
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        WHERE et.id = $1 AND et.organization_id = $2`,
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: 'Failed to fetch email template' });
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

      const client = await pool.connect();
      const result = await client.query(
        `INSERT INTO email_templates 
          (organization_id, name, subject, body_html, body_text, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
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
      );
      client.release();

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating email template:', error);
      res.status(500).json({ error: 'Failed to create email template' });
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
      const client = await pool.connect();

      // Check template exists and belongs to org
      const existing = await client.query(
        'SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Email template not found' });
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
         RETURNING *`,
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
      client.release();

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating email template:', error);
      res.status(500).json({ error: 'Failed to update email template' });
    }
  });

  /**
   * DELETE /api/email-templates/:id
   * Delete an email template
   */
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      const result = await client.query(
        'DELETE FROM email_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      res.json({ success: true, deleted_id: result.rows[0].id });
    } catch (error) {
      console.error('Error deleting email template:', error);
      res.status(500).json({ error: 'Failed to delete email template' });
    }
  });

  /**
   * POST /api/email-templates/:id/send-test
   * Send a test email using the template
   */
  router.post('/:id/send-test', authenticateJWT, requireOrganization, async (req, res) => {
    const { id } = req.params;
    const { to_email, sample_data } = req.body;

    if (!to_email) {
      return res.status(400).json({ error: 'to_email is required' });
    }

    try {
      const client = await pool.connect();
      const result = await client.query(
        'SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      const template = result.rows[0];

      // Send test email
      const sendResult = await emailService.sendTestEmail({
        template,
        toEmail: to_email,
        sampleData: sample_data || {},
      });

      if (sendResult.success) {
        res.json({
          success: true,
          message: 'Test email sent successfully',
          email_id: sendResult.id,
        });
      } else if (sendResult.simulated) {
        res.json({
          success: true,
          simulated: true,
          message: 'Email service not configured - email would have been sent',
        });
      } else {
        res.status(500).json({
          success: false,
          error: sendResult.error,
        });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      res.status(500).json({ error: 'Failed to send test email' });
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
      const client = await pool.connect();

      // Get the original template
      const original = await client.query(
        'SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (original.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Email template not found' });
      }

      const template = original.rows[0];

      // Create duplicate with "(Copy)" suffix
      const result = await client.query(
        `INSERT INTO email_templates 
          (organization_id, name, subject, body_html, body_text, variables, category, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
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
      client.release();

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error duplicating email template:', error);
      res.status(500).json({ error: 'Failed to duplicate email template' });
    }
  });

  return router;
};
