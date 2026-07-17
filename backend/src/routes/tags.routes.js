/**
 * Tags Routes
 * Handles tag CRUD operations for contacts and deals
 * Refactored with shared middleware (Phase 5)
 */
const express = require('express');
const router = express.Router();
const { withDbClient, withTransaction } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const { tagColumns } = require('./tag-columns');

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
          SELECT ${tagColumns('t')},
                 COUNT(DISTINCT ct.contact_id)::int AS contact_count,
                 COUNT(DISTINCT dt.deal_id)::int AS deal_count
          FROM tags t
          LEFT JOIN contact_tags ct ON ct.tag_id = t.id
          LEFT JOIN deal_tags dt ON dt.tag_id = t.id
          WHERE t.organization_id = $1
          GROUP BY t.id
          ORDER BY lower(t.name) ASC, t.id ASC
        `, [req.organizationId]);
        return result.rows;
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
      if (name.trim().length > 100) {
        return sendBadRequest(res, 'Tag name cannot exceed 100 characters', 'name');
      }

      const data = await withTransaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);

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
        RETURNING ${tagColumns()}
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

      if (name !== undefined && (!name || name.trim().length === 0)) {
        return sendBadRequest(res, 'Tag name is required', 'name');
      }
      if (name?.trim().length > 100) {
        return sendBadRequest(res, 'Tag name cannot exceed 100 characters', 'name');
      }

      const data = await withTransaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);

        // Get current tag
        const currentTag = await client.query(
          `SELECT ${tagColumns()} FROM tags WHERE id = $1 AND organization_id = $2`,
          [id, req.organizationId]
        );

        if (currentTag.rows.length === 0) {
          return { error: 'Tag not found', status: 404, result: null };
        }

        const oldName = currentTag.rows[0].name;

        if (name && name.trim().toLowerCase() !== oldName.toLowerCase()) {
          const duplicate = await client.query(
            `SELECT 1 FROM tags
             WHERE organization_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
            [req.organizationId, name.trim(), id]
          );
          if (duplicate.rows.length > 0) {
            return { error: 'Tag with this name already exists', status: 400, result: null };
          }
        }

        // Update tag
        const result = await client.query(`
        UPDATE tags 
        SET name = COALESCE($1, name),
            color = COALESCE($2, color)
        WHERE id = $3 AND organization_id = $4
        RETURNING ${tagColumns()}
      `, [name?.trim(), color, id, req.organizationId]);

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
      const data = await withTransaction(pool, async (client) => {
        // Get tag to delete
        const tagResult = await client.query(
          'SELECT name FROM tags WHERE id = $1 AND organization_id = $2',
          [id, req.organizationId]
        );

        if (tagResult.rows.length === 0) {
          return { error: 'Tag not found', status: 404 };
        }

        // Canonical deletion always removes membership. The database projects
        // that change to contact/deal compatibility arrays transactionally.
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
        SELECT name AS tag
        FROM tags
        WHERE organization_id = $1
        ORDER BY lower(name) ASC, id ASC
      `, [req.organizationId]));

      return sendSuccess(res, result.rows.map(r => r.tag));
    } catch (error) {
      console.error('Error fetching tag suggestions:', error);
      return sendError(res, 'Internal server error');
    }
  });

  return router;
};
