const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

/**
 * GET /api/contacts/:id/profile
 * Returns complete client profile with all cross-module data
 */
router.get('/:id/profile', async (req, res) => {
  const { id } = req.params;
  const { organization_id } = req.headers;

  try {
    logger.info('Fetching client profile', { contactId: id });

    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection not available' });
    }

    // 1. Get contact
    const contactQuery = `
      SELECT id, first_name, last_name, email, phone, company, 
             title, city, state, country, status, notes
      FROM contacts 
      WHERE id = $1 AND organization_id = $2
    `;
    const contactRes = await pool.query(contactQuery, [id, organization_id]);
    
    if (contactRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    const contact = contactRes.rows[0];

    // 2. Get invoices (checks if contact_id column exists)
    let invoices = [];
    try {
      const invoicesQuery = `SELECT * FROM invoices WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 10`;
      const invoicesRes = await pool.query(invoicesQuery, [id]);
      invoices = invoicesRes.rows;
    } catch (err) {
      // Column might not exist yet, log and continue
      logger.warn('Failed to fetch invoices', { error: err.message });
    }

    // 3. Get signatures (join through signature_recipients)
    let signatures = [];
    try {
      const signaturesQuery = `
        SELECT sd.*, sr.status, sr.signed_at 
        FROM signature_documents sd
        JOIN signature_recipients sr ON sd.id = sr.document_id
        WHERE sr.contact_id = $1
        ORDER BY sd.created_at DESC
        LIMIT 10
      `;
      const signaturesRes = await pool.query(signaturesQuery, [id]);
      signatures = signaturesRes.rows;
    } catch (err) {
      logger.warn('Failed to fetch signatures', { error: err.message });
    }

    // 4. Get payments
    let payments = [];
    if (invoices.length > 0) {
      const invoicesIds = invoices.map(inv => inv.id);
      try {
        const paymentsQuery = `
          SELECT p.*, i.invoice_number 
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.id = ANY($1)
          ORDER BY p.date DESC
        `;
        const paymentsRes = await pool.query(paymentsQuery, [invoicesIds]);
        payments = paymentsRes.rows;
      } catch (err) {
        logger.warn('Failed to fetch payments', { error: err.message });
      }
    }

    // 5. Get activities (contact_activities table)
    let activities = [];
    try {
      const activitiesQuery = `
        SELECT * FROM contact_activities 
        WHERE contact_id = $1 
        ORDER BY created_at DESC 
        LIMIT 50
      `;
      const activitiesRes = await pool.query(activitiesQuery, [id]);
      activities = activitiesRes.rows;
    } catch (err) {
      logger.warn('Failed to fetch activities', { error: err.message });
    }

    // 6. Get notes (checks if contact_id column exists)
    let notes = [];
    try {
      const notesQuery = `SELECT * FROM notes WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 20`;
      const notesRes = await pool.query(notesQuery, [id]);
      notes = notesRes.rows;
    } catch (err) {
      logger.warn('Failed to fetch notes', { error: err.message });
    }

    // 7. Get lists shared with contact
    let lists = [];
    try {
      const listsQuery = `
        SELECT l.* 
        FROM lists l 
        LEFT JOIN list_contacts lc ON l.id = lc.list_id 
        WHERE lc.contact_id = $1 OR l.id IN (
          SELECT list_id FROM list_items WHERE contact_id = $1
        )
        LIMIT 20
      `;
      const listsRes = await pool.query(listsQuery, [id]);
      lists = listsRes.rows;
    } catch (err) {
      logger.warn('Failed to fetch lists', { error: err.message });
    }

    // Build response
    const response = {
      contact: {
        id: contact.id.toString(),
        firstName: contact.first_name || '',
        lastName: contact.last_name || '',
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        title: contact.title,
        city: contact.city,
        state: contact.state,
        country: contact.country,
        status: contact.status || 'active',
        notes: contact.notes,
      },
      invoices: invoices.map(inv => ({
        id: inv.id.toString(),
        number: inv.invoice_number || `INV-${inv.id}`,
        status: inv.status || 'draft',
        total: inv.total || 0,
        date: inv.created_at,
        dueDate: inv.due_date,
      })),
      signatures: signatures.map(sig => ({
        id: sig.id.toString(),
        title: sig.title || 'Document',
        status: sig.status || 'draft',
        sentDate: sig.sent_at,
        signedDate: sig.signed_at,
      })),
      payments: payments.map(pay => ({
        id: pay.id?.toString() || '0',
        invoiceId: pay.invoice_id?.toString() || '0',
        invoiceNumber: pay.invoice_number || '',
        amount: pay.amount || 0,
        date: pay.date,
      })),
      communications: [], // TODO: Integrate with inbox
      notes: notes.map(note => ({
        id: note.id?.toString() || '0',
        title: note.title || 'Note',
        content: note.content || '',
        createdAt: note.created_at,
      })),
      lists: lists.map(list => ({
        id: list.id?.toString() || '0',
        title: list.title || 'List',
        category: list.category,
      })),
      tasks: [], // TODO: Integrate with task system
      bookings: [], // TODO: Integrate with bookings
      timeline: activities.map(act => ({
        id: act.id?.toString() || '0',
        type: act.type || 'created',
        title: act.title,
        description: act.content,
        timestamp: act.created_at,
      })),
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching client profile', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;