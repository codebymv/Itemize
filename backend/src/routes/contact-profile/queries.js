const CONTACT_COLUMNS = `
    id, first_name, last_name, email, phone, company,
    job_title AS title,
    address->>'city' AS city,
    address->>'state' AS state,
    address->>'country' AS country,
    status,
    NULL::text AS notes
`;

const INVOICE_COLUMNS = `
    id, invoice_number, status, total, created_at, due_date
`;

const SIGNATURE_COLUMNS = `
    sd.id, sd.title, sd.sent_at, sd.created_at,
    sr.status, sr.signed_at
`;

const PAYMENT_COLUMNS = `
    p.id, p.invoice_id, p.amount, p.date, i.invoice_number
`;

const ACTIVITY_COLUMNS = `
    id, type, title, content, created_at
`;

const NOTE_COLUMNS = `
    id, title, content, created_at
`;

const LIST_COLUMNS = `
    l.id, l.title, l.category
`;

const COMMUNICATION_COLUMNS = `
    m.id, m.channel as type, m.sender_type, m.content, m.created_at as date,
    c.subject
`;

const TASK_COLUMNS = `
    id, title, description, status, priority, due_date, completed_at, created_at
`;

const BOOKING_COLUMNS = `
    id, title, calendar_id, start_time, end_time, status, source
`;

async function fetchContact(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${CONTACT_COLUMNS}
        FROM contacts
        WHERE id = $1 AND organization_id = $2
    `, [contactId, organizationId]);

    return result.rows[0] || null;
}

async function fetchInvoices(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${INVOICE_COLUMNS}
        FROM invoices
        WHERE contact_id = $1 AND organization_id = $2
        ORDER BY created_at DESC
        LIMIT 10
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchSignatures(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${SIGNATURE_COLUMNS}
        FROM signature_documents sd
        JOIN signature_recipients sr ON sd.id = sr.document_id
        WHERE sr.contact_id = $1 AND sd.organization_id = $2
        ORDER BY sd.created_at DESC
        LIMIT 10
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchPayments(pool, invoiceIds, organizationId) {
    if (invoiceIds.length === 0) {
        return [];
    }

    const result = await pool.query(`
        SELECT ${PAYMENT_COLUMNS}
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.id = ANY($1) AND p.organization_id = $2
        ORDER BY p.date DESC
    `, [invoiceIds, organizationId]);

    return result.rows;
}

async function fetchActivities(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${ACTIVITY_COLUMNS.replaceAll(/\b(id|type|title|content|created_at)\b/g, 'ca.$1')}
        FROM contact_activities ca
        JOIN contacts c ON c.id = ca.contact_id
        WHERE ca.contact_id = $1 AND c.organization_id = $2
        ORDER BY ca.created_at DESC
        LIMIT 50
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchNotes(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${NOTE_COLUMNS}
        FROM notes
        WHERE contact_id = $1 AND organization_id = $2
        ORDER BY created_at DESC
        LIMIT 20
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchLists(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${LIST_COLUMNS}
        FROM lists l
        LEFT JOIN list_contacts lc ON l.id = lc.list_id
        WHERE l.organization_id = $2 AND (lc.contact_id = $1 OR l.id IN (
            SELECT list_id FROM list_items WHERE contact_id = $1
        ))
        LIMIT 20
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchCommunications(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${COMMUNICATION_COLUMNS}
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.contact_id = $1 AND c.organization_id = $2
        ORDER BY m.created_at DESC
        LIMIT 50
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchTasks(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${TASK_COLUMNS}
        FROM tasks
        WHERE contact_id = $1 AND organization_id = $2
        ORDER BY due_date ASC NULLS LAST, created_at DESC
        LIMIT 20
    `, [contactId, organizationId]);

    return result.rows;
}

async function fetchBookings(pool, contactId, organizationId) {
    const result = await pool.query(`
        SELECT ${BOOKING_COLUMNS}
        FROM bookings
        WHERE contact_id = $1 AND organization_id = $2
        ORDER BY start_time DESC
        LIMIT 20
    `, [contactId, organizationId]);

    return result.rows;
}

async function safeFetch(fetcher, logger, warningMessage) {
    try {
        return await fetcher();
    } catch (error) {
        logger.warn(warningMessage, { error: error.message });
        return [];
    }
}

async function fetchProfileData({ pool, contactId, organizationId, logger }) {
    const contact = await fetchContact(pool, contactId, organizationId);

    if (!contact) {
        return null;
    }

    const [
        invoices,
        signatures,
        activities,
        notes,
        lists,
        communications,
        tasks,
        bookings
    ] = await Promise.all([
        safeFetch(() => fetchInvoices(pool, contactId, organizationId), logger, 'Failed to fetch invoices'),
        safeFetch(() => fetchSignatures(pool, contactId, organizationId), logger, 'Failed to fetch signatures'),
        safeFetch(() => fetchActivities(pool, contactId, organizationId), logger, 'Failed to fetch activities'),
        safeFetch(() => fetchNotes(pool, contactId, organizationId), logger, 'Failed to fetch notes'),
        safeFetch(() => fetchLists(pool, contactId, organizationId), logger, 'Failed to fetch lists'),
        safeFetch(() => fetchCommunications(pool, contactId, organizationId), logger, 'Failed to fetch communications'),
        safeFetch(() => fetchTasks(pool, contactId, organizationId), logger, 'Failed to fetch tasks'),
        safeFetch(() => fetchBookings(pool, contactId, organizationId), logger, 'Failed to fetch bookings')
    ]);

    const payments = await safeFetch(
        () => fetchPayments(pool, invoices.map(invoice => invoice.id), organizationId),
        logger,
        'Failed to fetch payments'
    );

    return {
        contact,
        invoices,
        signatures,
        payments,
        activities,
        notes,
        lists,
        communications,
        tasks,
        bookings
    };
}

module.exports = {
    fetchProfileData
};
