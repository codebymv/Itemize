const express = require('express');
const router = express.Router();
const { validate, searchQuery } = require('../validators/schemas');

/**
 * POST /api/search
 * Cross-module search across all data
 */
router.post('/', validate(searchQuery), async (req, res) => {
  const data = req.body;
  const q = data.q?.trim();
  const types = data.types || ['contact', 'invoice', 'signature', 'list', 'note', 'campaign', 'workflow'];
  const limit = Math.min(data.limit || 10, 100); // Cap at 100
  
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  try {
    const pool = req.dbPool;
    const { organization_id } = req.headers;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection not available' });
    }

    const results = [];

    // Search Contacts
    if (types.includes('contact')) {
      try {
        const query = `
          SELECT id, first_name, last_name, email, phone
          FROM contacts
          WHERE organization_id = $1
            AND (
              first_name ILIKE $2 OR 
              last_name ILIKE $2 OR 
              email ILIKE $2
            )
          ORDER BY created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `contact-${row.id}`,
            type: 'contact',
            title: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
            subtitle: row.email ? `Email: ${row.email}` : `Phone: ${row.phone || 'N/A'}`,
            url: `/contacts/${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search contacts error:', err);
      }
    }

    // Search Invoices (only if contact_id column exists)
    if (types.includes('invoice')) {
      try {
        const query = `
          SELECT i.id, i.invoice_number, i.amount, i.status,
                 COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as contact_name
          FROM invoices i
          LEFT JOIN contacts c ON i.contact_id = c.id
          WHERE i.organization_id = $1
            AND (
              i.invoice_number ILIKE $2 OR 
              COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') ILIKE $2
            )
          ORDER BY i.created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `invoice-${row.id}`,
            type: 'invoice',
            title: row.invoice_number || `Invoice #${row.id}`,
            subtitle: row.contact_name || `Invoice #${row.id}`,
            url: `/invoices/${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search invoices error:', err);
      }
    }

    // Search Signatures (join through signature_recipients)
    if (types.includes('signature')) {
      try {
        const query = `
          SELECT sd.id, sd.title, sd.status, sd.created_at,
                 COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as contact_name
          FROM signature_documents sd
          JOIN signature_recipients sr ON sd.id = sr.document_id
          LEFT JOIN contacts c ON sr.contact_id = c.id
          WHERE sd.organization_id = $1
            AND sd.title ILIKE $2
          ORDER BY sd.created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `signature-${row.id}`,
            type: 'signature',
            title: row.title || 'Document',
            subtitle: row.contact_name || `Status: ${row.status || 'Draft'}`,
            url: `/documents/${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search signatures error:', err);
      }
    }

    // Search Lists
    if (types.includes('list')) {
      try {
        const query = `
          SELECT id, title, category
          FROM lists
          WHERE organization_id = $1
            AND title ILIKE $2
          ORDER BY created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `list-${row.id}`,
            type: 'list',
            title: row.title || 'List',
            subtitle: row.category || 'Uncategorized',
            url: `/canvas?list_id=${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search lists error:', err);
      }
    }

    // Search Notes
    if (types.includes('note')) {
      try {
        const query = `
          SELECT id, title, content
          FROM notes
          WHERE organization_id = $1
            AND (title ILIKE $2 OR content ILIKE $2)
          ORDER BY created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `note-${row.id}`,
            type: 'note',
            title: row.title || 'Note',
            subtitle: row.content?.substring(0, 100) || 'No content',
            url: `/canvas?note_id=${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search notes error:', err);
      }
    }

    // Search Campaigns
    if (types.includes('campaign')) {
      try {
        const query = `
          SELECT id, name, subject, status
          FROM campaigns
          WHERE organization_id = $1
            AND (name ILIKE $2 OR subject ILIKE $2)
          ORDER BY created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `campaign-${row.id}`,
            type: 'campaign',
            title: row.name || 'Campaign',
            subtitle: row.subject || `Status: ${row.status || 'Draft'}`,
            url: `/campaigns/${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search campaigns error:', err);
      }
    }

    // Search Workflows
    if (types.includes('workflow')) {
      try {
        const query = `
          SELECT id, name, trigger_type, is_active
          FROM workflows
          WHERE organization_id = $1
            AND name ILIKE $2
          ORDER BY created_at DESC
          LIMIT $3
        `;
        const res = await pool.query(query, [organization_id, `%${q}%`, limit]);
        res.rows.forEach(row => {
          results.push({
            id: `workflow-${row.id}`,
            type: 'workflow',
            title: row.name || 'Workflow',
            subtitle: row.is_active ? 'Active' : 'Inactive',
            url: `/automations/${row.id}`,
          });
        });
      } catch (err) {
        console.error('Search workflows error:', err);
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;