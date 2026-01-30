/**
 * Tags Routes
 * Handles tag CRUD operations for contacts and deals
 * Refactored with shared middleware (Phase 5)
 */
const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');

/**
 * Create tags routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  // Get all tags for the organization
  router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const tagsWithCounts = await withDbClient(pool, async (client) => {
        const result = await client.query(`
        SELECT t.*, 
               (SELECT COUNT(*) FROM contacts WHERE $1 = ANY(tags)) as contact_count
        FROM tags t
        WHERE t.organization_id = $2
        ORDER BY t.name ASC
      `, [null, req.organizationId]); // Note: This count query is simplified, see below for proper implementation
      
        // Get tag usage counts properly
        const counts = await Promise.all(result.rows.map(async (tag) => {
          const countResult = await client.query(`
          SELECT COUNT(*) FROM contacts 
          WHERE organization_id = $1 AND $2 = ANY(tags)
        `, [req.organizationId, tag.name]);
          return {
            ...tag,
            contact_count: parseInt(countResult.rows[0].count)
          };
        }));
        return counts;
      });

      return sendSuccess(res, tagsWithCounts);
    } catch (error) {
      console.error('Error fetching tags:', error);
      return sendError(res, 'Internal server error');
    }
  });

  // Create a new tag
  router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { name, color } = req.body;

      if (!name || name.trim().length === 0) {
        return sendBadRequest(res, 'Tag name is required', 'name');
      }

      const data = await withDbClient(pool, async (client) => {
        // Check if tag already exists
        const existingTag = await client.query(
          'SELECT id FROM tags WHERE organization_id = $1 AND LOWER(name) = LOWER($2)',
          [req.organizationId, name.trim()]
        );

        if (existingTag.rows.length > 0) {
          return { error: 'Tag with this name already exists', status: 400, result: null };
        }

        const result = await client.query(`
        INSERT INTO tags (organization_id, name, color)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [req.organizationId, name.trim(), color || '#3B82F6']);
        return { error: null, status: 201, result };
      });

      if (data.error) {
        return sendError(res, data.error, data.status || 400, 'BAD_REQUEST');
      }

      return sendCreated(res, data.result.rows[0]);
    } catch (error) {
      console.error('Error creating tag:', error);
      return sendError(res, 'Internal server error');
    }
  });

  // Update a tag
  router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color } = req.body;

      const data = await withDbClient(pool, async (client) => {
        // Get current tag
        const currentTag = await client.query(
          'SELECT * FROM tags WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (currentTag.rows.length === 0) {
          return { error: 'Tag not found', status: 404, result: null };
        }

        const oldName = currentTag.rows[0].name;

        // Update tag
        const result = await client.query(`
        UPDATE tags 
        SET name = COALESCE($1, name),
            color = COALESCE($2, color)
        WHERE id = $3 AND organization_id = $4
        RETURNING *
      `, [name?.trim(), color, id, req.organizationId]);

        // If name changed, update all contacts with this tag
        if (name && name.trim() !== oldName) {
          await client.query(`
          UPDATE contacts 
          SET tags = array_replace(tags, $1, $2)
          WHERE organization_id = $3 AND $1 = ANY(tags)
        `, [oldName, name.trim(), req.organizationId]);
        }

        return { error: null, status: 200, result };
      });

      if (data.error) {
        if (data.status === 404) {
          return sendNotFound(res, 'Tag');
        }
        return sendError(res, data.error, data.status || 400, 'BAD_REQUEST');
      }

      return sendSuccess(res, data.result.rows[0]);
    } catch (error) {
      console.error('Error updating tag:', error);
      return sendError(res, 'Internal server error');
    }
  });

  // Delete a tag
  router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { removeFromContacts } = req.query;

      const data = await withDbClient(pool, async (client) => {
        // Get tag to delete
        const tagResult = await client.query(
          'SELECT name FROM tags WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (tagResult.rows.length === 0) {
          return { error: 'Tag not found', status: 404 };
        }

        const tagName = tagResult.rows[0].name;

        // Remove tag from all contacts if requested
        if (removeFromContacts === 'true') {
          await client.query(`
          UPDATE contacts 
          SET tags = array_remove(tags, $1)
          WHERE organization_id = $2 AND $1 = ANY(tags)
        `, [tagName, req.organizationId]);
        }

        // Delete the tag
        await client.query(
          'DELETE FROM tags WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        return { error: null, status: 200 };
      });

      if (data.error) {
        if (data.status === 404) {
          return sendNotFound(res, 'Tag');
        }
        return sendError(res, data.error, data.status || 400, 'BAD_REQUEST');
      }

      return sendSuccess(res, { message: 'Tag deleted successfully' });
    } catch (error) {
      console.error('Error deleting tag:', error);
      return sendError(res, 'Internal server error');
    }
  });

  // Get all unique tags from contacts (for suggestions)
  router.get('/suggestions', authenticateJWT, requireOrganization, async (req, res) => {
    try {
      const result = await withDbClient(pool, async (client) => client.query(`
        SELECT DISTINCT unnest(tags) as tag
        FROM contacts
        WHERE organization_id = $1
        ORDER BY tag ASC
      `, [req.organizationId]));

      return sendSuccess(res, result.rows.map(r => r.tag));
    } catch (error) {
      console.error('Error fetching tag suggestions:', error);
      return sendError(res, 'Internal server error');
    }
  });

  return router;
};
