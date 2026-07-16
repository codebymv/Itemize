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
const { withDbClient, withTransaction } = require('../utils/db');
const {
    CONTACTS_LIMITS,
    ERROR_CODES,
    PLAN_METADATA
} = require('../lib/subscription.constants');
const { contactActivityColumns, contactColumns } = require('./contact-columns');
const { MAX_EXPORT_ROWS, csvCell, validateImportEnvelope } = require('../services/contactTransferPolicy');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
  enqueueWorkflowTrigger,
  workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');

const CONTACT_UPDATE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'job_title',
  'address',
  'source',
  'status',
  'custom_fields',
  'tags',
  'assigned_to',
];

function comparableContactValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changedContactFields(existing, updated, fields = CONTACT_UPDATE_FIELDS) {
  return fields.filter(
    field => comparableContactValue(existing?.[field]) !== comparableContactValue(updated?.[field])
  );
}

function tagDifference(left = [], right = []) {
  const rightTags = new Set(right || []);
  return [...new Set(left || [])].filter(tag => !rightTags.has(tag));
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
  async function checkContactLimit(client, organizationId) {
    const orgResult = await client.query(
      'SELECT plan, contacts_limit FROM organizations WHERE id = $1',
      [organizationId]
    );
    const org = orgResult.rows[0];
    const plan = org?.plan || 'starter';
    const limit = org?.contacts_limit ?? CONTACTS_LIMITS[plan] ?? 5000;
    
    const countResult = await client.query(
      'SELECT COUNT(*) FROM contacts WHERE organization_id = $1',
      [organizationId]
    );
    const current = parseInt(countResult.rows[0].count);
    
    // -1 means unlimited
    const allowed = limit === -1 || current < limit;
    
    return { allowed, limit, current, plan };
  }

  async function isOrganizationMember(client, organizationId, userId) {
    if (userId === null || userId === undefined) {
      return true;
    }

    const result = await client.query(
      `SELECT 1
       FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );
    return result.rows.length > 0;
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

    let whereClause = 'WHERE c.organization_id = $1';
    
    // Search filter (full-text search on name, email, company)
    if (search && search.trim()) {
      whereClause += ` AND (
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex}
      )`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Status filter
    if (status && ['active', 'inactive', 'archived'].includes(status)) {
      whereClause += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Tags filter (contacts that have ANY of the specified tags)
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      whereClause += ` AND c.tags && $${paramIndex}::text[]`;
      params.push(tagArray);
      paramIndex++;
    }

    // Assigned to filter
    if (assigned_to) {
      whereClause += ` AND c.assigned_to = $${paramIndex}`;
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
        `SELECT COUNT(*) FROM contacts c ${whereClause}`,
        params
      );
      const totalCount = parseInt(countResult.rows[0].count);

      // Get contacts with pagination
      const contactsResult = await client.query(`
        SELECT ${contactColumns('c')},
               u_assigned.name as assigned_to_name,
               u_created.name as created_by_name
        FROM contacts c
        LEFT JOIN users u_assigned ON c.assigned_to = u_assigned.id
        LEFT JOIN users u_created ON c.created_by = u_created.id
        ${whereClause}
        ORDER BY c.${sortColumn} ${sortDirection}, c.id ${sortDirection}
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
        SELECT ${contactColumns('c')},
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

    // Validate at least one identifier
    if (!first_name && !last_name && !email && !company) {
      return res.status(400).json({ error: 'At least one of first_name, last_name, email, or company is required' });
    }

    const outcome = await withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);

      const limitCheck = await checkContactLimit(client, req.organizationId);
      if (!limitCheck.allowed) {
        return { status: 'limit', limitCheck };
      }

      if (!await isOrganizationMember(client, req.organizationId, assigned_to)) {
        return { status: 'invalid_assignee' };
      }

      const result = await client.query(`
        INSERT INTO contacts (
          organization_id, first_name, last_name, email, phone,
          company, job_title, address, source, status,
          custom_fields, tags, assigned_to, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING ${contactColumns()}
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

      const contact = result.rows[0];
      await enqueueWorkflowTrigger(client, {
        contactId: contact.id,
        entityId: contact.id,
        entityType: 'contact',
        eventKey: workflowTriggerEventKey('domain', `contact_added:${contact.id}`),
        organizationId: req.organizationId,
        payload: { source: source || 'manual' },
        triggerType: WORKFLOW_TRIGGERS.CONTACT_ADDED,
      });

      return { status: 'ok', contact };
    });

    if (outcome.status === 'limit') {
      const { limitCheck } = outcome;
      const planName = PLAN_METADATA[limitCheck.plan]?.displayName || limitCheck.plan;
      return res.status(403).json({
        error: `Contact limit reached. Your ${planName} plan allows ${limitCheck.limit} contact(s). Please upgrade to add more.`,
        code: ERROR_CODES.PLAN_LIMIT_REACHED,
        current: limitCheck.current,
        limit: limitCheck.limit,
        plan: limitCheck.plan
      });
    }

    if (outcome.status === 'invalid_assignee') {
      return res.status(400).json({ error: 'assigned_to must be a member of the active organization' });
    }

    // Log activity
    await logActivity(pool, outcome.contact.id, req.user.id, 'system', 'Contact Created', {
      action: 'created',
      by: req.user.name || req.user.email
    });

    res.status(201).json(outcome.contact);
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

    const result = await withTransaction(pool, async (client) => {
      // First check the contact exists and belongs to this org
      const existing = await client.query(
        `SELECT ${contactColumns()}
         FROM contacts
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        return { notFound: true };
      }

      if (!await isOrganizationMember(client, req.organizationId, assigned_to)) {
        return { invalidAssignee: true };
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
        RETURNING ${contactColumns()}
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

      const previousContact = existing.rows[0];
      const updatedContact = updateResult.rows[0];
      const changedFields = changedContactFields(previousContact, updatedContact);

      if (changedFields.length > 0) {
        await enqueueWorkflowTrigger(client, {
          contactId: updatedContact.id,
          entityId: updatedContact.id,
          entityType: 'contact',
          organizationId: req.organizationId,
          payload: {
            changed_fields: changedFields,
            previous_source: previousContact.source,
            previous_status: previousContact.status,
            source: updatedContact.source,
            status: updatedContact.status,
          },
          triggerType: WORKFLOW_TRIGGERS.CONTACT_UPDATED,
        });
      }

      return {
        changedFields,
        existing: previousContact,
        updated: updatedContact,
      };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (result.invalidAssignee) {
      return res.status(400).json({ error: 'assigned_to must be a member of the active organization' });
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

    const result = await withTransaction(pool, async (client) => {
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

    const result = await withTransaction(pool, async (client) => {
      if (!await isOrganizationMember(client, req.organizationId, updates.assigned_to)) {
        return { invalidAssignee: true, rows: [] };
      }

      const existingResult = await client.query(`
        SELECT id, status, assigned_to, tags
        FROM contacts
        WHERE id = ANY($1::int[]) AND organization_id = $2
        FOR UPDATE
      `, [contact_ids, req.organizationId]);
      const existingById = new Map(
        existingResult.rows.map(contact => [String(contact.id), contact])
      );

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
          setClause.push(`tags = ARRAY(
            SELECT DISTINCT tag
            FROM unnest(contacts.tags || $${paramIndex}::text[]) AS tag
          )`);
        } else if (updates.tags_mode === 'remove') {
          setClause.push(`tags = ARRAY(
            SELECT tag
            FROM unnest(contacts.tags) AS tag
            WHERE NOT (tag = ANY($${paramIndex}::text[]))
          )`);
        } else {
          setClause.push(`tags = $${paramIndex}`);
        }
        params.push(updates.tags);
        paramIndex++;
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');

      const updateResult = await client.query(`
        UPDATE contacts
        SET ${setClause.join(', ')}
        WHERE id = ANY($${paramIndex}::int[]) AND organization_id = $${paramIndex + 1}
        RETURNING id, status, assigned_to, tags
      `, [...params, contact_ids, req.organizationId]);

      for (const row of updateResult.rows) {
        const existing = existingById.get(String(row.id));
        const changedFields = changedContactFields(
          existing,
          row,
          ['status', 'assigned_to', 'tags']
        );
        if (changedFields.length > 0) {
          await enqueueWorkflowTrigger(client, {
            contactId: row.id,
            entityId: row.id,
            entityType: 'contact',
            organizationId: req.organizationId,
            payload: {
              changed_fields: changedFields,
              previous_status: existing?.status || null,
              status: row.status,
            },
            triggerType: WORKFLOW_TRIGGERS.CONTACT_UPDATED,
          });
        }

        for (const tag of tagDifference(row.tags, existing?.tags)) {
          await enqueueWorkflowTrigger(client, {
            contactId: row.id,
            entityId: row.id,
            entityType: 'contact',
            organizationId: req.organizationId,
            payload: { tag },
            triggerType: WORKFLOW_TRIGGERS.TAG_ADDED,
          });
        }

        for (const tag of tagDifference(existing?.tags, row.tags)) {
          await enqueueWorkflowTrigger(client, {
            contactId: row.id,
            entityId: row.id,
            entityType: 'contact',
            organizationId: req.organizationId,
            payload: { tag },
            triggerType: WORKFLOW_TRIGGERS.TAG_REMOVED,
          });
        }
      }
      return updateResult;
    });

    if (result.invalidAssignee) {
      return res.status(400).json({ error: 'assigned_to must be a member of the active organization' });
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
        SELECT ${contactActivityColumns('ca')}, u.name as user_name, u.email as user_email
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
        RETURNING ${contactActivityColumns()}
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

      const [listsResult, notesResult, whiteboardsResult] = await Promise.all([
        client.query(
          'SELECT id, title, category, created_at FROM lists WHERE contact_id = $1 ORDER BY created_at DESC',
          [id]
        ),
        client.query(
          'SELECT id, title, category, created_at FROM notes WHERE contact_id = $1 ORDER BY created_at DESC',
          [id]
        ),
        client.query(
          'SELECT id, title, category, created_at FROM whiteboards WHERE contact_id = $1 ORDER BY created_at DESC',
          [id]
        )
      ]);

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
        LIMIT $${paramIndex}
      `, [...params, MAX_EXPORT_ROWS + 1]);
    });

    if (result.rows.length > MAX_EXPORT_ROWS) {
      return res.status(413).json({
        error: `Contact exports are limited to ${MAX_EXPORT_ROWS} rows`,
        code: 'EXPORT_TOO_LARGE'
      });
    }

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
      ...rows.map(row => row.map(csvCell).join(','))
    ].join('\n');

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csvContent);
  }));

  // Import contacts from CSV - Optimized bulk import
  router.post('/import/csv', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
    const { contacts: importData, skipDuplicates = true } = req.body || {};

    const envelopeError = validateImportEnvelope(importData, skipDuplicates);
    if (envelopeError) return res.status(400).json({ error: envelopeError, code: 'INVALID_IMPORT' });

    const results = await withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);

      const outcome = {
        imported: 0,
        skipped: 0,
        errors: []
      };

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
            outcome.skipped++;
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

          if (skipDuplicates && row.email) {
            existingEmails.add(row.email.toLowerCase());
          }
        } catch (rowError) {
          outcome.errors.push({
            row: i + 1,
            error: rowError.message
          });
        }
      }

      const limitCheck = await checkContactLimit(client, req.organizationId);
      if (limitCheck.limit !== -1 && limitCheck.current + contactsToInsert.length > limitCheck.limit) {
        return {
          ...outcome,
          limitExceeded: true,
          limitCheck,
          attempted: contactsToInsert.length,
        };
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

        outcome.imported += batch.length;
      }

      return outcome;
    });

    if (results.limitExceeded) {
      return res.status(403).json({
        error: 'Contact import would exceed the active organization limit',
        code: ERROR_CODES.PLAN_LIMIT_REACHED,
        current: results.limitCheck.current,
        limit: results.limitCheck.limit,
        attempted: results.attempted,
      });
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
