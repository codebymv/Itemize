/**
 * Organizations Routes
 * Handles organization CRUD and member management
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendError
} = require('../utils/response');

/**
 * Create organizations routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {

  /**
   * Helper to generate URL-friendly slug from name
   */
  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + crypto.randomBytes(4).toString('hex');
  };

  /**
   * Middleware to check organization membership
   */
  const requireOrgAccess = (requiredRoles = ['owner', 'admin', 'member', 'viewer']) => {
    return async (req, res, next) => {
      try {
        const organizationId = req.params.organizationId || req.body.organization_id;
        if (!organizationId) {
          return sendBadRequest(res, 'Organization ID required');
        }

        const result = await withDbClient(pool, async (client) => {
          return client.query(
            'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
            [organizationId, req.user.id]
          );
        });

        if (result.rows.length === 0) {
          return sendForbidden(res, 'Not a member of this organization');
        }

        const userRole = result.rows[0].role;
        if (!requiredRoles.includes(userRole)) {
          return sendForbidden(res, 'Insufficient permissions');
        }

        req.orgRole = userRole;
        req.organizationId = parseInt(organizationId);
        next();
      } catch (error) {
        console.error('Error checking org access:', error);
        return sendError(res, 'Internal server error', 500);
      }
    };
  };

  // Get all organizations for the current user
  router.get('/', authenticateJWT, asyncHandler(async (req, res) => {
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
        SELECT o.*, om.role, om.joined_at
        FROM organizations o
        JOIN organization_members om ON o.id = om.organization_id
        WHERE om.user_id = $1
        ORDER BY o.name ASC
      `, [req.user.id]);
      });
      return sendSuccess(res, result.rows);
  }));

  // Get a single organization by ID
  router.get('/:organizationId', authenticateJWT, requireOrgAccess(), asyncHandler(async (req, res) => {
      const result = await withDbClient(pool, async (client) => {
        return client.query(
        'SELECT * FROM organizations WHERE id = $1',
        [req.organizationId]
      );
      });

      if (result.rows.length === 0) {
        return sendNotFound(res, 'Organization');
      }

      return sendSuccess(res, { ...result.rows[0], role: req.orgRole });
  }));

  // Create a new organization
  router.post('/', authenticateJWT, asyncHandler(async (req, res) => {
      const { name, settings } = req.body;

      if (!name || name.trim().length === 0) {
        return sendBadRequest(res, 'Organization name is required');
      }

      const slug = generateSlug(name);

      const organization = await withTransaction(pool, async (client) => {
        const orgResult = await client.query(`
          INSERT INTO organizations (name, slug, settings)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [name.trim(), slug, JSON.stringify(settings || {})]);

        const createdOrg = orgResult.rows[0];

        await client.query(`
          INSERT INTO organization_members (organization_id, user_id, role, joined_at)
          VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
        `, [createdOrg.id, req.user.id]);

        await client.query(`
          UPDATE users 
          SET default_organization_id = $1 
          WHERE id = $2 AND default_organization_id IS NULL
        `, [createdOrg.id, req.user.id]);

        return createdOrg;
      });

      return sendCreated(res, { ...organization, role: 'owner' });
  }));

  // Update an organization
  router.put('/:organizationId', authenticateJWT, requireOrgAccess(['owner', 'admin']), asyncHandler(async (req, res) => {
      const { name, settings, logo_url } = req.body;
      
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
        UPDATE organizations 
        SET name = COALESCE($1, name),
            settings = COALESCE($2, settings),
            logo_url = COALESCE($3, logo_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, [name, settings ? JSON.stringify(settings) : null, logo_url, req.organizationId]);
      });

      if (result.rows.length === 0) {
        return sendNotFound(res, 'Organization');
      }

      return sendSuccess(res, result.rows[0]);
  }));

  // Delete an organization (owner only)
  router.delete('/:organizationId', authenticateJWT, requireOrgAccess(['owner']), asyncHandler(async (req, res) => {
      await withDbClient(pool, async (client) => {
        return client.query('DELETE FROM organizations WHERE id = $1', [req.organizationId]);
      });

      return sendSuccess(res, { message: 'Organization deleted successfully' });
  }));

  // Get organization members
  router.get('/:organizationId/members', authenticateJWT, requireOrgAccess(), asyncHandler(async (req, res) => {
      const result = await withDbClient(pool, async (client) => {
        return client.query(`
        SELECT om.*, u.email, u.name as user_name
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = $1
        ORDER BY om.role ASC, u.name ASC
      `, [req.organizationId]);
      });

      return sendSuccess(res, result.rows);
  }));

  // Invite a member to the organization
  router.post('/:organizationId/members', authenticateJWT, requireOrgAccess(['owner', 'admin']), asyncHandler(async (req, res) => {
      const { email, role } = req.body;

      if (!email) {
        return sendBadRequest(res, 'Email is required');
      }

      const validRoles = ['admin', 'member', 'viewer'];
      const memberRole = validRoles.includes(role) ? role : 'member';

      const userResult = await withDbClient(pool, async (client) => {
        return client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );
      });

      if (userResult.rows.length === 0) {
        return sendNotFound(res, 'User');
      }

      const userId = userResult.rows[0].id;

      const existingMember = await withDbClient(pool, async (client) => {
        return client.query(
          'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
          [req.organizationId, userId]
        );
      });

      if (existingMember.rows.length > 0) {
        return sendBadRequest(res, 'User is already a member of this organization');
      }

      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          INSERT INTO organization_members (organization_id, user_id, role, invited_by, joined_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          RETURNING *
        `, [req.organizationId, userId, memberRole, req.user.id]);
      });

      return sendCreated(res, result.rows[0]);
  }));

  // Update member role
  router.put('/:organizationId/members/:memberId', authenticateJWT, requireOrgAccess(['owner', 'admin']), asyncHandler(async (req, res) => {
      const { memberId } = req.params;
      const { role } = req.body;

      const validRoles = ['admin', 'member', 'viewer'];
      if (!validRoles.includes(role)) {
        return sendBadRequest(res, 'Invalid role. Must be admin, member, or viewer');
      }

      const memberCheck = await withDbClient(pool, async (client) => {
        return client.query(
          'SELECT role, user_id FROM organization_members WHERE id = $1 AND organization_id = $2',
          [memberId, req.organizationId]
        );
      });

      if (memberCheck.rows.length === 0) {
        return sendNotFound(res, 'Member');
      }

      if (memberCheck.rows[0].role === 'owner') {
        return sendForbidden(res, 'Cannot change owner role');
      }

      // Admins cannot change other admins unless they are owner
      if (req.orgRole === 'admin' && memberCheck.rows[0].role === 'admin') {
        return sendForbidden(res, 'Admins cannot modify other admins');
      }

      const result = await withDbClient(pool, async (client) => {
        return client.query(`
          UPDATE organization_members 
          SET role = $1
          WHERE id = $2 AND organization_id = $3
          RETURNING *
        `, [role, memberId, req.organizationId]);
      });

      return sendSuccess(res, result.rows[0]);
  }));

  // Remove a member from the organization
  router.delete('/:organizationId/members/:memberId', authenticateJWT, requireOrgAccess(['owner', 'admin']), asyncHandler(async (req, res) => {
      const { memberId } = req.params;

      const memberCheck = await withDbClient(pool, async (client) => {
        return client.query(
          'SELECT role, user_id FROM organization_members WHERE id = $1 AND organization_id = $2',
          [memberId, req.organizationId]
        );
      });

      if (memberCheck.rows.length === 0) {
        return sendNotFound(res, 'Member');
      }

      if (memberCheck.rows[0].role === 'owner') {
        return sendForbidden(res, 'Cannot remove organization owner');
      }

      // Admins cannot remove other admins unless they are owner
      if (req.orgRole === 'admin' && memberCheck.rows[0].role === 'admin') {
        return sendForbidden(res, 'Admins cannot remove other admins');
      }

      await withDbClient(pool, async (client) => {
        return client.query(
          'DELETE FROM organization_members WHERE id = $1 AND organization_id = $2',
          [memberId, req.organizationId]
        );
      });

      return sendSuccess(res, { message: 'Member removed successfully' });
  }));

  // Leave an organization (for non-owners)
  router.post('/:organizationId/leave', authenticateJWT, requireOrgAccess(), asyncHandler(async (req, res) => {
      if (req.orgRole === 'owner') {
        return sendForbidden(res, 'Owner cannot leave. Transfer ownership or delete the organization.');
      }

      await withDbClient(pool, async (client) => {
        return client.query(
          'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
          [req.organizationId, req.user.id]
        );
      });

      return sendSuccess(res, { message: 'Successfully left organization' });
  }));

  // Get or create default organization for user
  router.post('/ensure-default', authenticateJWT, asyncHandler(async (req, res) => {
      const existingOrgs = await withDbClient(pool, async (client) => {
        return client.query(`
          SELECT o.*, om.role
          FROM organizations o
          JOIN organization_members om ON o.id = om.organization_id
          WHERE om.user_id = $1
          LIMIT 1
        `, [req.user.id]);
      });

      if (existingOrgs.rows.length > 0) {
        const org = existingOrgs.rows[0];
        await withDbClient(pool, async (client) => {
          return client.query(`
            UPDATE users 
            SET default_organization_id = $1 
            WHERE id = $2 AND default_organization_id IS NULL
          `, [org.id, req.user.id]);
        });
        return sendSuccess(res, org);
      }

      const userName = req.user.name || req.user.email.split('@')[0];
      const orgName = `${userName}'s Workspace`;
      const slug = generateSlug(orgName);

      const organization = await withTransaction(pool, async (client) => {
        const orgResult = await client.query(`
          INSERT INTO organizations (name, slug, settings)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [orgName, slug, JSON.stringify({ personal: true })]);

        const createdOrg = orgResult.rows[0];

        await client.query(`
          INSERT INTO organization_members (organization_id, user_id, role, joined_at)
          VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
        `, [createdOrg.id, req.user.id]);

        await client.query(`
          UPDATE users 
          SET default_organization_id = $1 
          WHERE id = $2
        `, [createdOrg.id, req.user.id]);

        return createdOrg;
      });

      return sendCreated(res, { ...organization, role: 'owner' });
  }));

  return router;
};
