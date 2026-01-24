/**
 * Contacts Routes
 * Handles contact CRUD operations, search, filtering, and activities
 * Refactored with shared middleware and asyncHandler (Phase 5)
 * Updated with feature gating (Subscription Phase 6)
 */
const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validators } = require('../validators');
const { withDbClient } = require('../utils/db');
const { 
    CONTACTS_LIMITS, 
    ERROR_CODES,
    PLAN_METADATA 
} = require('../lib/subscription.constants');

// Import automation engine for triggers
let automationEngine = null;
try {
  const { getAutomationEngine } = require('../services/automationEngine');
  // Will be initialized after first use when pool is available
  automationEngine = { getEngine: getAutomationEngine };
} catch (e) {
  logger.warn('Automation engine not available', { error: e.message });
}

/**
 * Create contacts routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
  // Use shared organization middleware (Phase 5.3)
  const { requireOrganization } = require('../middleware/organization')(pool);

  /**
   * Helper: Check contact limit for organization
   */
  async function checkContactLimit(organizationId) {
    const orgResult = await pool.query(
      'SELECT plan, contacts_limit FROM organizations WHERE id = $1',
      [organizationId]
    );
    const org = orgResult.rows[0];
    const plan = org?.plan || 'starter';
    const limit = org?.contacts_limit ?? CONTACTS_LIMITS[plan] ?? 5000;
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM contacts WHERE organization_id = $1',
      [organizationId]
    );
    const current = parseInt(countResult.rows[0].count);
    
    // -1 means unlimited
    const allowed = limit === -1 || current < limit;
    
    return { allowed, limit, current, plan };
  }

  // Get all contacts with search, filtering, and pagination
  router.get('/', authenticateJWT, requireOrganization, validators.pagination, asyncHandler(async (req, res) => {
    const {
      search,
      status,
      tags,
      assigned_to,
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1,
      limit = 50
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [req.organizationId];
    let paramIndex = 2;

    let whereClause = 'WHERE organization_id = $1';
    
    // Search filter (full-text search on name, email, company)
    if (search && search.trim()) {
      whereClause += ` AND (
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        company ILIKE $${paramIndex} OR
        phone ILIKE $${paramIndex}
      )`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Status filter
    if (status && ['active', 'inactive', 'archived'].includes(status)) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Tags filter (contacts that have ANY of the specified tags)
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      whereClause += ` AND tags && $${paramIndex}::text[]`;
      params.push(tagArray);
      paramIndex++;
    }

    // Assigned to filter
    if (assigned_to) {
      whereClause += ` AND assigned_to = $${paramIndex}`;
      params.push(parseInt(assigned_to));
      paramIndex++;
    }

    // Validate sort column
    const validSortColumns = ['created_at', 'updated_at', 'first_name', 'last_name', 'email', 'company'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const result = await withDbClient(pool, async (client) => {
      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) FROM contacts ${whereClause}`,
        params
      );
      const totalCount = parseInt(countResult.rows[0].count);

      // Get contacts with pagination
      const contactsResult = await client.query(`
        SELECT c.*, 
               u_assigned.name as assigned_to_name,
               u_created.name as created_by_name
        FROM contacts c
        LEFT JOIN users u_assigned ON c.assigned_to = u_assigned.id
        LEFT JOIN users u_created ON c.created_by = u_created.id
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]);

      return { contacts: contactsResult.rows, totalCount };
    });

    res.json({
      contacts: result.contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.totalCount,
        totalPages: Math.ceil(result.totalCount / parseInt(limit))
      }
    });
  }));

  // Get a single contact by ID
  router.get('/:id', authenticateJWT, requireOrganization, validators.idParam, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await withDbClient(pool, async (client) => {
      return client.query(`
        SELECT c.*, 
               u_assigned.name as assigned_to_name, u_assigned.email as assigned_to_email,
               u_created.name as created_by_name
        FROM contacts c
        LEFT JOIN users u_assigned ON c.assigned_to = u_assigned.id
        LEFT JOIN users u_created ON c.created_by = u_created.id
        WHERE c.id = $1 AND c.organization_id = $2
      `, [id, req.organizationId]);
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  }));

  // Create a new contact
  // Usage limited: contacts_per_org count based on plan
  router.post('/', authenticateJWT, requireOrganization, validators.createContact, asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      company,
      job_title,
      address,
      source,
      status,
      custom_fields,
      tags,
      assigned_to
    } = req.body;

    // Check contact limit (inline check - gleamai pattern)
    const limitCheck = await checkContactLimit(req.organizationId);
    if (!limitCheck.allowed) {
      const planName = PLAN_METADATA[limitCheck.plan]?.displayName || limitCheck.plan;
      return res.status(403).json({
        error: `Contact limit reached. Your ${planName} plan allows ${limitCheck.limit} contact(s). Please upgrade to add more.`,
        code: ERROR_CODES.PLAN_LIMIT_REACHED,
        current: limitCheck.current,
        limit: limitCheck.limit,
        plan: limitCheck.plan
      });
    }

    // Validate at least one identifier
    if (!first_name && !last_name && !email && !company) {
      return res.status(400).json({ error: 'At least one of first_name, last_name, email, or company is required' });
    }

    const result = await withDbClient(pool, async (client) => {
      return client.query(`
        INSERT INTO contacts (
          organization_id, first_name, last_name, email, phone,
          company, job_title, address, source, status,
          custom_fields, tags, assigned_to, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        req.organizationId,
        first_name || null,
        last_name || null,
        email || null,
        phone || null,
        company || null,
        job_title || null,
        JSON.stringify(address || {}),
        source || 'manual',
        status || 'active',
        JSON.stringify(custom_fields || {}),
        tags || [],
        assigned_to || null,
        req.user.id
      ]);
    });

    // Log activity
    await logActivity(pool, result.rows[0].id, req.user.id, 'system', 'Contact Created', {
      action: 'created',
      by: req.user.name || req.user.email
    });

    // Trigger automation for contact_added
    if (automationEngine) {
      try {
        const engine = automationEngine.getEngine();
        engine.handleTrigger('contact_added', {
          contact: result.rows[0],
          organizationId: req.organizationId,
          source: source || 'manual',
        }).catch(err => logger.error('Automation trigger error', { error: err.message }));
      } catch (triggerError) {
        logger.debug('Automation engine not initialized yet');
      }
    }

    res.status(201).json(result.rows[0]);
  }));

  // Update a contact
  router.put('/:id', authenticateJWT, requireOrganization, validators.updateContact, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      phone,
      company,
      job_title,
      address,
      source,
      status,
      custom_fields,
      tags,
      assigned_to
    } = req.body;

    const result = await withDbClient(pool, async (client) => {
      // First check the contact exists and belongs to this org
      const existing = await client.query(
        'SELECT * FROM contacts WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        return { notFound: true };
      }

      const updateResult = await client.query(`
        UPDATE contacts SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          company = COALESCE($5, company),
          job_title = COALESCE($6, job_title),
          address = COALESCE($7, address),
          source = COALESCE($8, source),
          status = COALESCE($9, status),
          custom_fields = COALESCE($10, custom_fields),
          tags = COALESCE($11, tags),
          assigned_to = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13 AND organization_id = $14
        RETURNING *
      `, [
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        address ? JSON.stringify(address) : null,
        source,
        status,
        custom_fields ? JSON.stringify(custom_fields) : null,
        tags,
        assigned_to,
        id,
        req.organizationId
      ]);

      return { existing: existing.rows[0], updated: updateResult.rows[0] };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Log status change if status was updated
    if (status && status !== result.existing.status) {
      await logActivity(pool, id, req.user.id, 'status_change', 'Status Changed', {
        from: result.existing.status,
        to: status
      });
    }

    res.json(result.updated);
  }));

  // Delete a contact
  router.delete('/:id', authenticateJWT, requireOrganization, validators.idParam, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await withDbClient(pool, async (client) => {
      return client.query(
        'DELETE FROM contacts WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, req.organizationId]
      );
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true, message: 'Contact deleted successfully' });
  }));

  // Bulk update contacts (for bulk tagging, assigning, etc.)
  router.post('/bulk-update', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
    const { contact_ids, updates } = req.body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'contact_ids array is required' });
    }

    const allowedUpdates = ['status', 'assigned_to', 'tags'];
    const updateKeys = Object.keys(updates || {}).filter(k => allowedUpdates.includes(k));

    if (updateKeys.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided. Allowed: status, assigned_to, tags' });
    }

    const result = await withDbClient(pool, async (client) => {
      // Build dynamic update query
      let setClause = [];
      let params = [];
      let paramIndex = 1;

      if (updates.status) {
        setClause.push(`status = $${paramIndex}`);
        params.push(updates.status);
        paramIndex++;
      }

      if (updates.assigned_to !== undefined) {
        setClause.push(`assigned_to = $${paramIndex}`);
        params.push(updates.assigned_to);
        paramIndex++;
      }

      if (updates.tags) {
        if (updates.tags_mode === 'add') {
          setClause.push(`tags = array_cat(tags, $${paramIndex}::text[])`);
        } else if (updates.tags_mode === 'remove') {
          setClause.push(`tags = array_remove_all(tags, $${paramIndex}::text[])`);
        } else {
          setClause.push(`tags = $${paramIndex}`);
        }
        params.push(updates.tags);
        paramIndex++;
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');

      return client.query(`
        UPDATE contacts 
        SET ${setClause.join(', ')}
        WHERE id = ANY($${paramIndex}::int[]) AND organization_id = $${paramIndex + 1}
        RETURNING id
      `, [...params, contact_ids, req.organizationId]);
    });

    // Fire tag_added trigger if tags were added
    if (updates.tags && updates.tags_mode === 'add' && automationEngine) {
      try {
        const engine = automationEngine.getEngine();
        // Fire trigger for each contact and each tag
        for (const contactId of result.rows.map(r => r.id)) {
          for (const tag of updates.tags) {
            engine.handleTrigger('tag_added', {
              contact: { id: contactId },
              organizationId: req.organizationId,
              tag: tag,
            }).catch(err => logger.error('Automation trigger error', { error: err.message }));
          }
        }
      } catch (triggerError) {
        logger.debug('Automation engine not initialized yet');
      }
    }

    res.json({
      success: true,
      message: `${result.rows.length} contacts updated`,
      updated_ids: result.rows.map(r => r.id)
    });
  }));

  // Bulk delete contacts
  router.post('/bulk-delete', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
    const { contact_ids } = req.body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'contact_ids array is required' });
    }

    const result = await withDbClient(pool, async (client) => {
      return client.query(
        'DELETE FROM contacts WHERE id = ANY($1::int[]) AND organization_id = $2 RETURNING id',
        [contact_ids, req.organizationId]
      );
    });

    res.json({
      success: true,
      message: `${result.rows.length} contacts deleted`,
      deleted_ids: result.rows.map(r => r.id)
    });
  }));

  // Get contact activities
  router.get('/:id/activities', authenticateJWT, requireOrganization, validators.idParam, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, limit = 50, offset = 0 } = req.query;

    const result = await withDbClient(pool, async (client) => {
      // Verify contact belongs to organization
      const contactCheck = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (contactCheck.rows.length === 0) {
        return { notFound: true };
      }

      let whereClause = 'WHERE ca.contact_id = $1';
      const params = [id];
      let paramIndex = 2;

      if (type) {
        whereClause += ` AND ca.type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      const activities = await client.query(`
        SELECT ca.*, u.name as user_name, u.email as user_email
        FROM contact_activities ca
        LEFT JOIN users u ON ca.user_id = u.id
        ${whereClause}
        ORDER BY ca.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);

      return { activities: activities.rows };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.activities);
  }));

  // Add an activity to a contact
  router.post('/:id/activities', authenticateJWT, requireOrganization, validators.idParam, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, title, content, metadata } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Activity type is required' });
    }

    const validTypes = ['note', 'email', 'call', 'task', 'meeting', 'status_change', 'deal_update', 'system'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid activity type. Must be one of: ${validTypes.join(', ')}` });
    }

    const result = await withDbClient(pool, async (client) => {
      // Verify contact belongs to organization
      const contactCheck = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (contactCheck.rows.length === 0) {
        return { notFound: true };
      }

      const activity = await client.query(`
        INSERT INTO contact_activities (contact_id, user_id, type, title, content, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        id,
        req.user.id,
        type,
        title || null,
        JSON.stringify(content || {}),
        JSON.stringify(metadata || {})
      ]);

      return { activity: activity.rows[0] };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.status(201).json(result.activity);
  }));

  // Get related content for a contact (notes, lists, whiteboards)
  router.get('/:id/content', authenticateJWT, requireOrganization, validators.idParam, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await withDbClient(pool, async (client) => {
      // Verify contact belongs to organization
      const contactCheck = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
        [id, req.organizationId]
      );

      if (contactCheck.rows.length === 0) {
        return { notFound: true };
      }

      // Get linked lists
      const listsResult = await client.query(
        'SELECT id, title, category, created_at FROM lists WHERE contact_id = $1 ORDER BY created_at DESC',
        [id]
      );

      // Get linked notes
      const notesResult = await client.query(
        'SELECT id, title, category, created_at FROM notes WHERE contact_id = $1 ORDER BY created_at DESC',
        [id]
      );

      // Get linked whiteboards
      const whiteboardsResult = await client.query(
        'SELECT id, title, category, created_at FROM whiteboards WHERE contact_id = $1 ORDER BY created_at DESC',
        [id]
      );

      return {
        lists: listsResult.rows,
        notes: notesResult.rows,
        whiteboards: whiteboardsResult.rows
      };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result);
  }));

  // Export contacts to CSV
  router.get('/export/csv', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
    const { status, tags } = req.query;
    
    let whereClause = 'WHERE organization_id = $1';
    const params = [req.organizationId];
    let paramIndex = 2;

    if (status && ['active', 'inactive', 'archived'].includes(status)) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      whereClause += ` AND tags && $${paramIndex}::text[]`;
      params.push(tagArray);
      paramIndex++;
    }

    const result = await withDbClient(pool, async (client) => {
      return client.query(`
        SELECT 
          first_name, last_name, email, phone, company, job_title,
          address->>'street' as street,
          address->>'city' as city,
          address->>'state' as state,
          address->>'zip' as zip,
          address->>'country' as country,
          status, source,
          array_to_string(tags, ';') as tags,
          created_at
        FROM contacts
        ${whereClause}
        ORDER BY created_at DESC
      `, params);
    });

    // Generate CSV
    const headers = [
      'First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Job Title',
      'Street', 'City', 'State', 'ZIP', 'Country', 'Status', 'Source', 'Tags', 'Created At'
    ];

    const rows = result.rows.map(row => [
      row.first_name || '',
      row.last_name || '',
      row.email || '',
      row.phone || '',
      row.company || '',
      row.job_title || '',
      row.street || '',
      row.city || '',
      row.state || '',
      row.zip || '',
      row.country || '',
      row.status || '',
      row.source || '',
      row.tags || '',
      row.created_at ? new Date(row.created_at).toISOString() : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
    res.send(csvContent);
  }));

  // Import contacts from CSV - Optimized bulk import
  router.post('/import/csv', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
    const { contacts: importData, skipDuplicates = true } = req.body;

    if (!Array.isArray(importData) || importData.length === 0) {
      return res.status(400).json({ error: 'No contacts data provided' });
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Step 1: Get all existing emails in one query (bulk duplicate check)
      let existingEmails = new Set();
      if (skipDuplicates) {
        const emails = importData
          .map(row => row.email)
          .filter(Boolean);
        
        if (emails.length > 0) {
          const existingResult = await client.query(
            'SELECT email FROM contacts WHERE organization_id = $1 AND email = ANY($2::text[])',
            [req.organizationId, emails]
          );
          existingEmails = new Set(existingResult.rows.map(r => r.email.toLowerCase()));
        }
      }

      // Step 2: Prepare contacts for bulk insert
      const contactsToInsert = [];
      const BATCH_SIZE = 500; // Process in batches to avoid query size limits

      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        
        try {
          // Skip duplicates based on pre-fetched data
          if (skipDuplicates && row.email && existingEmails.has(row.email.toLowerCase())) {
            results.skipped++;
            continue;
          }

          // Parse tags
          let tags = [];
          if (row.tags) {
            if (typeof row.tags === 'string') {
              tags = row.tags.split(';').map(t => t.trim()).filter(Boolean);
            } else if (Array.isArray(row.tags)) {
              tags = row.tags;
            }
          }

          // Build address object
          const address = {};
          if (row.street) address.street = row.street;
          if (row.city) address.city = row.city;
          if (row.state) address.state = row.state;
          if (row.zip) address.zip = row.zip;
          if (row.country) address.country = row.country;

          contactsToInsert.push({
            first_name: row.first_name || row.firstName || null,
            last_name: row.last_name || row.lastName || null,
            email: row.email || null,
            phone: row.phone || null,
            company: row.company || null,
            job_title: row.job_title || row.jobTitle || null,
            address: JSON.stringify(address),
            status: row.status || 'active',
            tags: tags,
            rowIndex: i
          });
        } catch (rowError) {
          results.errors.push({
            row: i + 1,
            error: rowError.message
          });
        }
      }

      // Step 3: Bulk insert in batches
      for (let batchStart = 0; batchStart < contactsToInsert.length; batchStart += BATCH_SIZE) {
        const batch = contactsToInsert.slice(batchStart, batchStart + BATCH_SIZE);
        
        if (batch.length === 0) continue;

        // Build bulk insert query
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const contact of batch) {
          placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
          values.push(
            req.organizationId,
            contact.first_name,
            contact.last_name,
            contact.email,
            contact.phone,
            contact.company,
            contact.job_title,
            contact.address,
            'import',
            contact.status,
            contact.tags,
            req.user.id
          );
        }

        await client.query(`
          INSERT INTO contacts (
            organization_id, first_name, last_name, email, phone,
            company, job_title, address, source, status, tags, created_by
          ) VALUES ${placeholders.join(', ')}
        `, values);

        results.imported += batch.length;
      }

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    logger.info('Contact import completed', { 
      organizationId: req.organizationId, 
      imported: results.imported, 
      skipped: results.skipped 
    });

    res.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.skipped} skipped`,
      ...results
    });
  }));

  // Helper function to log activity
  async function logActivity(pool, contactId, userId, type, title, content) {
    try {
      await withDbClient(pool, async (client) => {
        await client.query(`
          INSERT INTO contact_activities (contact_id, user_id, type, title, content)
          VALUES ($1, $2, $3, $4, $5)
        `, [contactId, userId, type, title, JSON.stringify(content)]);
      });
    } catch (error) {
      logger.error('Error logging activity', { error: error.message, contactId });
      // Don't throw - activity logging should not break main operations
    }
  }

  return router;
};
