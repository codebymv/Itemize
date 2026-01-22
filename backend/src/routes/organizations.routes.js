/**
 * Organizations Routes
 * Handles organization CRUD and member management
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

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
          return res.status(400).json({ error: 'Organization ID required' });
        }

        const client = await pool.connect();
        const result = await client.query(
          'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
          [organizationId, req.user.id]
        );
        client.release();

        if (result.rows.length === 0) {
          return res.status(403).json({ error: 'Not a member of this organization' });
        }

        const userRole = result.rows[0].role;
        if (!requiredRoles.includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        req.orgRole = userRole;
        req.organizationId = parseInt(organizationId);
        next();
      } catch (error) {
        console.error('Error checking org access:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };
  };

  // Get all organizations for the current user
  router.get('/', authenticateJWT, async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT o.*, om.role, om.joined_at
        FROM organizations o
        JOIN organization_members om ON o.id = om.organization_id
        WHERE om.user_id = $1
        ORDER BY o.name ASC
      `, [req.user.id]);
      client.release();
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching organizations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get a single organization by ID
  router.get('/:organizationId', authenticateJWT, requireOrgAccess(), async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(
        'SELECT * FROM organizations WHERE id = $1',
        [req.organizationId]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json({ ...result.rows[0], role: req.orgRole });
    } catch (error) {
      console.error('Error fetching organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new organization
  router.post('/', authenticateJWT, async (req, res) => {
    try {
      const { name, settings } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Organization name is required' });
      }

      const slug = generateSlug(name);

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');

        // Create the organization
        const orgResult = await client.query(`
          INSERT INTO organizations (name, slug, settings)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [name.trim(), slug, JSON.stringify(settings || {})]);

        const organization = orgResult.rows[0];

        // Add the creator as owner
        await client.query(`
          INSERT INTO organization_members (organization_id, user_id, role, joined_at)
          VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
        `, [organization.id, req.user.id]);

        // Set as user's default organization if they don't have one
        await client.query(`
          UPDATE users 
          SET default_organization_id = $1 
          WHERE id = $2 AND default_organization_id IS NULL
        `, [organization.id, req.user.id]);

        await client.query('COMMIT');
        
        res.status(201).json({ ...organization, role: 'owner' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creating organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update an organization
  router.put('/:organizationId', authenticateJWT, requireOrgAccess(['owner', 'admin']), async (req, res) => {
    try {
      const { name, settings, logo_url } = req.body;
      
      const client = await pool.connect();
      const result = await client.query(`
        UPDATE organizations 
        SET name = COALESCE($1, name),
            settings = COALESCE($2, settings),
            logo_url = COALESCE($3, logo_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, [name, settings ? JSON.stringify(settings) : null, logo_url, req.organizationId]);
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete an organization (owner only)
  router.delete('/:organizationId', authenticateJWT, requireOrgAccess(['owner']), async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query('DELETE FROM organizations WHERE id = $1', [req.organizationId]);
      client.release();

      res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
      console.error('Error deleting organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get organization members
  router.get('/:organizationId/members', authenticateJWT, requireOrgAccess(), async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT om.*, u.email, u.name as user_name
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = $1
        ORDER BY om.role ASC, u.name ASC
      `, [req.organizationId]);
      client.release();

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching organization members:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Invite a member to the organization
  router.post('/:organizationId/members', authenticateJWT, requireOrgAccess(['owner', 'admin']), async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const validRoles = ['admin', 'member', 'viewer'];
      const memberRole = validRoles.includes(role) ? role : 'member';

      const client = await pool.connect();

      // Find user by email
      const userResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'User not found. They must have an account first.' });
      }

      const userId = userResult.rows[0].id;

      // Check if already a member
      const existingMember = await client.query(
        'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [req.organizationId, userId]
      );

      if (existingMember.rows.length > 0) {
        client.release();
        return res.status(400).json({ error: 'User is already a member of this organization' });
      }

      // Add member
      const result = await client.query(`
        INSERT INTO organization_members (organization_id, user_id, role, invited_by, joined_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `, [req.organizationId, userId, memberRole, req.user.id]);

      client.release();
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error inviting member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update member role
  router.put('/:organizationId/members/:memberId', authenticateJWT, requireOrgAccess(['owner', 'admin']), async (req, res) => {
    try {
      const { memberId } = req.params;
      const { role } = req.body;

      const validRoles = ['admin', 'member', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, member, or viewer' });
      }

      const client = await pool.connect();

      // Check if trying to change owner role
      const memberCheck = await client.query(
        'SELECT role, user_id FROM organization_members WHERE id = $1 AND organization_id = $2',
        [memberId, req.organizationId]
      );

      if (memberCheck.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Member not found' });
      }

      if (memberCheck.rows[0].role === 'owner') {
        client.release();
        return res.status(403).json({ error: 'Cannot change owner role' });
      }

      // Admins cannot change other admins unless they are owner
      if (req.orgRole === 'admin' && memberCheck.rows[0].role === 'admin') {
        client.release();
        return res.status(403).json({ error: 'Admins cannot modify other admins' });
      }

      const result = await client.query(`
        UPDATE organization_members 
        SET role = $1
        WHERE id = $2 AND organization_id = $3
        RETURNING *
      `, [role, memberId, req.organizationId]);

      client.release();
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating member role:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Remove a member from the organization
  router.delete('/:organizationId/members/:memberId', authenticateJWT, requireOrgAccess(['owner', 'admin']), async (req, res) => {
    try {
      const { memberId } = req.params;

      const client = await pool.connect();

      // Check member exists and is not owner
      const memberCheck = await client.query(
        'SELECT role, user_id FROM organization_members WHERE id = $1 AND organization_id = $2',
        [memberId, req.organizationId]
      );

      if (memberCheck.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Member not found' });
      }

      if (memberCheck.rows[0].role === 'owner') {
        client.release();
        return res.status(403).json({ error: 'Cannot remove organization owner' });
      }

      // Admins cannot remove other admins unless they are owner
      if (req.orgRole === 'admin' && memberCheck.rows[0].role === 'admin') {
        client.release();
        return res.status(403).json({ error: 'Admins cannot remove other admins' });
      }

      await client.query(
        'DELETE FROM organization_members WHERE id = $1 AND organization_id = $2',
        [memberId, req.organizationId]
      );

      client.release();
      res.json({ message: 'Member removed successfully' });
    } catch (error) {
      console.error('Error removing member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Leave an organization (for non-owners)
  router.post('/:organizationId/leave', authenticateJWT, requireOrgAccess(), async (req, res) => {
    try {
      if (req.orgRole === 'owner') {
        return res.status(403).json({ error: 'Owner cannot leave. Transfer ownership or delete the organization.' });
      }

      const client = await pool.connect();
      await client.query(
        'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [req.organizationId, req.user.id]
      );
      client.release();

      res.json({ message: 'Successfully left organization' });
    } catch (error) {
      console.error('Error leaving organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get or create default organization for user
  router.post('/ensure-default', authenticateJWT, async (req, res) => {
    try {
      const client = await pool.connect();

      try {
        // Check if user already has organizations
        const existingOrgs = await client.query(`
          SELECT o.*, om.role
          FROM organizations o
          JOIN organization_members om ON o.id = om.organization_id
          WHERE om.user_id = $1
          LIMIT 1
        `, [req.user.id]);

        if (existingOrgs.rows.length > 0) {
          // User already has an organization
          const org = existingOrgs.rows[0];
          
          // Update user's default if not set
          await client.query(`
            UPDATE users 
            SET default_organization_id = $1 
            WHERE id = $2 AND default_organization_id IS NULL
          `, [org.id, req.user.id]);

          client.release();
          return res.json(org);
        }

        // Create a personal organization for the user
        const userName = req.user.name || req.user.email.split('@')[0];
        const orgName = `${userName}'s Workspace`;
        const slug = generateSlug(orgName);

        await client.query('BEGIN');

        const orgResult = await client.query(`
          INSERT INTO organizations (name, slug, settings)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [orgName, slug, JSON.stringify({ personal: true })]);

        const organization = orgResult.rows[0];

        await client.query(`
          INSERT INTO organization_members (organization_id, user_id, role, joined_at)
          VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
        `, [organization.id, req.user.id]);

        await client.query(`
          UPDATE users 
          SET default_organization_id = $1 
          WHERE id = $2
        `, [organization.id, req.user.id]);

        await client.query('COMMIT');
        client.release();

        res.status(201).json({ ...organization, role: 'owner' });
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        throw error;
      }
    } catch (error) {
      console.error('Error ensuring default organization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
