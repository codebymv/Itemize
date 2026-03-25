/**
 * Recurring Invoices Routes
 * Manage recurring invoice templates
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { withDbClient } = require('../utils/db');

module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Calculate next run date based on frequency
     */
    function calculateNextRunDate(startDate, frequency, lastRunDate = null) {
        const baseDate = lastRunDate ? new Date(lastRunDate) : new Date(startDate);
        const nextDate = new Date(baseDate);

        switch (frequency) {
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
            case 'yearly':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
        }

        return nextDate.toISOString().split('T')[0];
    }

    /**
     * GET /api/invoices/recurring/preview-invoice-number - Get next invoice number for preview
     */
    router.get('/preview-invoice-number', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const settingsResult = await withDbClient(pool, async (client) => {
                return client.query(
                    'SELECT invoice_prefix, next_invoice_number FROM payment_settings WHERE organization_id = $1',
                    [req.organizationId]
                );
            });

            let prefix = 'INV-';
            let nextNumber = 1;

            if (settingsResult.rows.length > 0) {
                prefix = settingsResult.rows[0].invoice_prefix || 'INV-';
                nextNumber = settingsResult.rows[0].next_invoice_number || 1;
            }

            const previewNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;
            
            res.json({ invoice_number: previewNumber });
        } catch (error) {
            console.error('Error getting preview invoice number:', error);
            res.status(500).json({ error: 'Failed to get preview invoice number' });
        }
    });

    /**
     * GET /api/invoices/recurring - List recurring invoice templates
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status } = req.query;
            const result = await withDbClient(pool, async (client) => {
                let whereClause = 'WHERE r.organization_id = $1';
                const params = [req.organizationId];

                if (status && status !== 'all') {
                    whereClause += ' AND r.status = $2';
                    params.push(status);
                }

                return client.query(`
                    SELECT r.*, 
                        c.first_name as contact_first_name, 
                        c.last_name as contact_last_name,
                        (SELECT COUNT(*) FROM invoices i WHERE i.recurring_template_id = r.id) as invoices_generated,
                        si.invoice_number as source_invoice_number
                    FROM recurring_invoice_templates r
                    LEFT JOIN contacts c ON r.contact_id = c.id
                    LEFT JOIN invoices si ON r.source_invoice_id = si.id
                    ${whereClause}
                    ORDER BY r.created_at DESC
                `, params);
            });

            res.json({ recurring: result.rows });
        } catch (error) {
            console.error('Error fetching recurring invoices:', error);
            res.status(500).json({ error: 'Failed to fetch recurring invoices' });
        }
    });

    /**
     * GET /api/invoices/recurring/:id - Get recurring template details
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    SELECT r.*, 
                        c.first_name as contact_first_name, 
                        c.last_name as contact_last_name,
                        si.invoice_number as source_invoice_number
                    FROM recurring_invoice_templates r
                    LEFT JOIN contacts c ON r.contact_id = c.id
                    LEFT JOIN invoices si ON r.source_invoice_id = si.id
                    WHERE r.id = $1 AND r.organization_id = $2
                `, [id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Recurring invoice not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching recurring invoice:', error);
            res.status(500).json({ error: 'Failed to fetch recurring invoice' });
        }
    });

    /**
     * POST /api/invoices/recurring - Create recurring invoice template
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                template_name,
                contact_id,
                customer_name,
                customer_email,
                frequency,
                start_date,
                end_date,
                items,
                discount_type,
                discount_value,
                notes,
                payment_terms
            } = req.body;

            if (!template_name || !frequency || !start_date) {
                return res.status(400).json({ error: 'Template name, frequency, and start date are required' });
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'At least one line item is required' });
            }

            // Calculate totals
            let subtotal = 0;
            let taxAmount = 0;

            for (const item of items) {
                const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
                subtotal += itemTotal;
                taxAmount += itemTax;
            }

            let discountAmount = 0;
            if (discount_value && discount_value > 0) {
                if (discount_type === 'percent') {
                    discountAmount = subtotal * (discount_value / 100);
                } else {
                    discountAmount = discount_value;
                }
            }

            const total = subtotal + taxAmount - discountAmount;

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    INSERT INTO recurring_invoice_templates (
                        organization_id, template_name, contact_id, customer_name, customer_email,
                        frequency, start_date, end_date, next_run_date,
                        items, subtotal, tax_amount, discount_amount, discount_type, discount_value, total,
                        notes, payment_terms, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    RETURNING *
                `, [
                    req.organizationId,
                    template_name,
                    contact_id || null,
                    customer_name || null,
                    customer_email || null,
                    frequency,
                    start_date,
                    end_date || null,
                    start_date, // First run is on start date
                    JSON.stringify(items),
                    subtotal,
                    taxAmount,
                    discountAmount,
                    discount_type || null,
                    discount_value || 0,
                    total,
                    notes || null,
                    payment_terms || null,
                    req.user.id
                ]);
            });

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating recurring invoice:', error);
            res.status(500).json({ error: 'Failed to create recurring invoice' });
        }
    });

    /**
     * PUT /api/invoices/recurring/:id - Update recurring template
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                template_name,
                contact_id,
                customer_name,
                customer_email,
                frequency,
                end_date,
                items,
                discount_type,
                discount_value,
                notes,
                payment_terms
            } = req.body;

            const result = await withDbClient(pool, async (client) => {
                // Check if exists
                const checkResult = await client.query(
                    'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return null;
                }

                let updateFields = [];
                let updateParams = [];
                let paramIndex = 1;

            if (template_name) {
                updateFields.push(`template_name = $${paramIndex++}`);
                updateParams.push(template_name);
            }
            if (contact_id !== undefined) {
                updateFields.push(`contact_id = $${paramIndex++}`);
                updateParams.push(contact_id || null);
            }
            if (customer_name !== undefined) {
                updateFields.push(`customer_name = $${paramIndex++}`);
                updateParams.push(customer_name);
            }
            if (customer_email !== undefined) {
                updateFields.push(`customer_email = $${paramIndex++}`);
                updateParams.push(customer_email);
            }
            if (frequency) {
                updateFields.push(`frequency = $${paramIndex++}`);
                updateParams.push(frequency);
            }
            if (end_date !== undefined) {
                updateFields.push(`end_date = $${paramIndex++}`);
                updateParams.push(end_date || null);
            }
            if (notes !== undefined) {
                updateFields.push(`notes = $${paramIndex++}`);
                updateParams.push(notes);
            }
            if (payment_terms !== undefined) {
                updateFields.push(`payment_terms = $${paramIndex++}`);
                updateParams.push(payment_terms);
            }

            if (items && Array.isArray(items) && items.length > 0) {
                let subtotal = 0;
                let taxAmount = 0;

                for (const item of items) {
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
                    subtotal += itemTotal;
                    taxAmount += itemTax;
                }

                let discountAmount = 0;
                if (discount_value && discount_value > 0) {
                    if (discount_type === 'percent') {
                        discountAmount = subtotal * (discount_value / 100);
                    } else {
                        discountAmount = discount_value;
                    }
                }

                const total = subtotal + taxAmount - discountAmount;

                updateFields.push(`items = $${paramIndex++}`);
                updateParams.push(JSON.stringify(items));
                updateFields.push(`subtotal = $${paramIndex++}`);
                updateParams.push(subtotal);
                updateFields.push(`tax_amount = $${paramIndex++}`);
                updateParams.push(taxAmount);
                updateFields.push(`discount_amount = $${paramIndex++}`);
                updateParams.push(discountAmount);
                updateFields.push(`total = $${paramIndex++}`);
                updateParams.push(total);
            }

            if (discount_type !== undefined) {
                updateFields.push(`discount_type = $${paramIndex++}`);
                updateParams.push(discount_type);
            }
            if (discount_value !== undefined) {
                updateFields.push(`discount_value = $${paramIndex++}`);
                updateParams.push(discount_value);
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');

                updateParams.push(id, req.organizationId);
                const updated = await client.query(`
                    UPDATE recurring_invoice_templates 
                    SET ${updateFields.join(', ')}
                    WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                    RETURNING *
                `, updateParams);

                return updated.rows[0] || null;
            });

            if (!result) {
                return res.status(404).json({ error: 'Recurring invoice not found' });
            }

            res.json(result);
        } catch (error) {
            console.error('Error updating recurring invoice:', error);
            res.status(500).json({ error: 'Failed to update recurring invoice' });
        }
    });

    /**
     * DELETE /api/invoices/recurring/:id - Delete recurring template
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Recurring invoice not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting recurring invoice:', error);
            res.status(500).json({ error: 'Failed to delete recurring invoice' });
        }
    });

    /**
     * POST /api/invoices/recurring/:id/pause - Pause recurring invoice
     */
    router.post('/:id/pause', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    UPDATE recurring_invoice_templates 
                    SET status = 'paused', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND status = 'active'
                    RETURNING *
                `, [id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Recurring invoice not found or not active' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error pausing recurring invoice:', error);
            res.status(500).json({ error: 'Failed to pause recurring invoice' });
        }
    });

    /**
     * POST /api/invoices/recurring/:id/resume - Resume recurring invoice
     */
    router.post('/:id/resume', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const template = await client.query(
                    'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (template.rows.length === 0) {
                    return { status: 'not_found' };
                }

                // Calculate new next run date if it's in the past
                let nextRunDate = template.rows[0].next_run_date;
                const today = new Date();

                while (new Date(nextRunDate) < today) {
                    nextRunDate = calculateNextRunDate(
                        template.rows[0].start_date,
                        template.rows[0].frequency,
                        nextRunDate
                    );
                }

                const updated = await client.query(`
                    UPDATE recurring_invoice_templates 
                    SET status = 'active', next_run_date = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND status = 'paused'
                    RETURNING *
                `, [id, req.organizationId, nextRunDate]);

                if (updated.rows.length === 0) {
                    return { status: 'not_paused' };
                }

                return { status: 'ok', data: updated.rows[0] };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Recurring invoice not found' });
            }
            if (result.status === 'not_paused') {
                return res.status(404).json({ error: 'Recurring invoice not found or not paused' });
            }

            res.json(result.data);
        } catch (error) {
            console.error('Error resuming recurring invoice:', error);
            res.status(500).json({ error: 'Failed to resume recurring invoice' });
        }
    });

    /**
     * POST /api/invoices/recurring/:id/generate-now - Manually generate next invoice from template
     * Generates an invoice immediately and advances the next_run_date
     */
    router.post('/:id/generate-now', authenticateJWT, requireOrganization, async (req, res) => {
        await withDbClient(pool, async (client) => {
            try {
                const { id } = req.params;

                await client.query('BEGIN');

                // Get the template
                const templateResult = await client.query(`
                    SELECT r.*, c.email as contact_email
                    FROM recurring_invoice_templates r
                    LEFT JOIN contacts c ON r.contact_id = c.id
                    WHERE r.id = $1 AND r.organization_id = $2
                `, [id, req.organizationId]);

                if (templateResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Recurring template not found' });
                }

                const template = templateResult.rows[0];

                // Check if template is completed
                if (template.status === 'completed') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Cannot generate invoice from completed template' });
                }

                // Get next invoice number
                const settingsResult = await client.query(
                    'SELECT invoice_prefix, next_invoice_number FROM payment_settings WHERE organization_id = $1',
                    [req.organizationId]
                );

                let prefix = 'INV-';
                let nextNumber = 1;

                if (settingsResult.rows.length > 0) {
                    prefix = settingsResult.rows[0].invoice_prefix || 'INV-';
                    nextNumber = settingsResult.rows[0].next_invoice_number || 1;

                    await client.query(
                        'UPDATE payment_settings SET next_invoice_number = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2',
                        [nextNumber + 1, req.organizationId]
                    );
                } else {
                    await client.query(`
                        INSERT INTO payment_settings (organization_id, next_invoice_number)
                        VALUES ($1, 2)
                    `, [req.organizationId]);
                }

                const invoiceNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;

                // Calculate due date based on payment terms (default 30 days)
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + (template.payment_terms ? parseInt(template.payment_terms) : 30));

                // Parse items from JSON
                const items = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;

                // Create the invoice
                const invoiceResult = await client.query(`
                    INSERT INTO invoices (
                        organization_id, invoice_number, contact_id,
                        customer_name, customer_email,
                        due_date, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                        total, amount_due, notes, recurring_template_id, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    RETURNING *
                `, [
                    req.organizationId,
                    invoiceNumber,
                    template.contact_id,
                    template.customer_name,
                    template.customer_email || template.contact_email,
                    dueDate.toISOString().split('T')[0],
                    template.subtotal,
                    template.tax_amount,
                    template.discount_amount,
                    template.discount_type,
                    template.discount_value,
                    template.total,
                    template.total, // amount_due
                    template.notes,
                    template.id,
                    req.user.id
                ]);

                const invoiceId = invoiceResult.rows[0].id;

                // Create invoice items
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                    await client.query(`
                        INSERT INTO invoice_items (
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        invoiceId,
                        req.organizationId,
                        item.product_id || null,
                        item.name,
                        item.description || null,
                        item.quantity || 1,
                        item.unit_price || 0,
                        item.tax_rate || 0,
                        itemTax,
                        itemTotal + itemTax,
                        i
                    ]);
                }

                // Calculate next run date
                const nextRunDate = calculateNextRunDate(template.next_run_date, template.frequency);

                // Check if completed (past end_date)
                const isCompleted = template.end_date && new Date(nextRunDate) > new Date(template.end_date);

                // Update template
                await client.query(`
                    UPDATE recurring_invoice_templates 
                    SET 
                        next_run_date = $1, 
                        last_generated_at = CURRENT_TIMESTAMP,
                        status = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [
                    isCompleted ? template.end_date : nextRunDate,
                    isCompleted ? 'completed' : template.status,
                    template.id
                ]);

                await client.query('COMMIT');

                logger.info('Invoice generated manually from recurring template', {
                    templateId: template.id,
                    templateName: template.template_name,
                    invoiceId: invoiceId,
                    invoiceNumber: invoiceNumber,
                    organizationId: req.organizationId,
                    userId: req.user.id
                });

                return res.status(201).json({
                    success: true,
                    invoice_id: invoiceId,
                    invoice_number: invoiceNumber,
                    next_run_date: isCompleted ? null : nextRunDate,
                    template_status: isCompleted ? 'completed' : template.status,
                    message: `Invoice ${invoiceNumber} generated successfully`
                });
            } catch (error) {
                await client.query('ROLLBACK');
                logger.error('Error generating invoice from template:', error);
                return res.status(500).json({ error: 'Failed to generate invoice' });
            }
        });
    });

    /**
     * GET /api/invoices/recurring/:id/history - Get generated invoices history
     */
    router.get('/:id/history', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    SELECT i.id, i.invoice_number, i.total, i.status, i.created_at
                    FROM invoices i
                    WHERE i.recurring_template_id = $1 AND i.organization_id = $2
                    ORDER BY i.created_at DESC
                `, [id, req.organizationId]);
            });

            res.json({ invoices: result.rows });
        } catch (error) {
            console.error('Error fetching recurring invoice history:', error);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    });

    /**
     * POST /api/invoices/recurring/from-invoice/:invoiceId - Create recurring template from invoice
     * Creates a recurring template based on an existing invoice (non-destructive - invoice is preserved)
     */
    router.post('/from-invoice/:invoiceId', authenticateJWT, requireOrganization, async (req, res) => {
        await withDbClient(pool, async (client) => {
            try {
                const { invoiceId } = req.params;
                const {
                    template_name,
                    frequency,
                    start_date,
                    end_date
                } = req.body;

                // Validate required fields
                if (!template_name || !frequency || !start_date) {
                    return res.status(400).json({ error: 'Template name, frequency, and start date are required' });
                }

                if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) {
                    return res.status(400).json({ error: 'Invalid frequency. Must be weekly, monthly, quarterly, or yearly' });
                }

                // Start transaction
                await client.query('BEGIN');

                // Fetch the invoice
                const invoiceResult = await client.query(`
                    SELECT i.*, 
                        c.first_name as contact_first_name, 
                        c.last_name as contact_last_name,
                        c.email as contact_email
                    FROM invoices i
                    LEFT JOIN contacts c ON i.contact_id = c.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [invoiceId, req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Invoice not found' });
                }

                const invoice = invoiceResult.rows[0];

                // Check if invoice status allows conversion (exclude cancelled/refunded)
                if (['cancelled', 'refunded'].includes(invoice.status)) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Cannot convert cancelled or refunded invoices' });
                }

                // Fetch invoice line items
                const itemsResult = await client.query(`
                    SELECT name, description, quantity, unit_price, tax_rate, product_id
                    FROM invoice_items
                    WHERE invoice_id = $1
                    ORDER BY id
                `, [invoiceId]);

                const items = itemsResult.rows.map(item => ({
                    name: item.name,
                    description: item.description || '',
                    quantity: parseFloat(item.quantity) || 1,
                    unit_price: parseFloat(item.unit_price) || 0,
                    tax_rate: parseFloat(item.tax_rate) || 0,
                    product_id: item.product_id || null
                }));

                if (items.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Invoice has no line items' });
                }

                // Calculate totals
                let subtotal = 0;
                let taxAmount = 0;

                for (const item of items) {
                    const itemTotal = item.quantity * item.unit_price;
                    const itemTax = itemTotal * (item.tax_rate / 100);
                    subtotal += itemTotal;
                    taxAmount += itemTax;
                }

                let discountAmount = 0;
                const discountType = invoice.discount_type;
                const discountValue = parseFloat(invoice.discount_value) || 0;

                if (discountValue > 0) {
                    if (discountType === 'percent') {
                        discountAmount = subtotal * (discountValue / 100);
                    } else {
                        discountAmount = discountValue;
                    }
                }

                const total = subtotal + taxAmount - discountAmount;

                // Create the recurring template with reference to source invoice
                const templateResult = await client.query(`
                    INSERT INTO recurring_invoice_templates (
                        organization_id, template_name, contact_id, customer_name, customer_email,
                        frequency, start_date, end_date, next_run_date,
                        items, subtotal, tax_amount, discount_amount, discount_type, discount_value, total,
                        notes, payment_terms, created_by, status, source_invoice_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'active', $20)
                    RETURNING *
                `, [
                    req.organizationId,
                    template_name,
                    invoice.contact_id || null,
                    invoice.customer_name || null,
                    invoice.customer_email || null,
                    frequency,
                    start_date,
                    end_date || null,
                    start_date, // First run is on start date
                    JSON.stringify(items),
                    subtotal,
                    taxAmount,
                    discountAmount,
                    discountType || null,
                    discountValue,
                    total,
                    invoice.notes || null,
                    invoice.payment_terms || null,
                    req.user.id,
                    invoiceId // source_invoice_id - reference to the original invoice
                ]);

                const newTemplate = templateResult.rows[0];

                // Mark the source invoice as a recurring source (non-destructive - invoice is preserved)
                await client.query(
                    'UPDATE invoices SET is_recurring_source = true WHERE id = $1 AND organization_id = $2',
                    [invoiceId, req.organizationId]
                );

                // Commit transaction
                await client.query('COMMIT');

                logger.info('Recurring template created from invoice', {
                    sourceInvoiceId: invoiceId,
                    templateId: newTemplate.id,
                    organizationId: req.organizationId,
                    userId: req.user.id
                });

                return res.status(201).json({
                    success: true,
                    template: newTemplate,
                    sourceInvoicePreserved: true,
                    message: 'Recurring template created successfully. Original invoice has been preserved.'
                });
            } catch (error) {
                await client.query('ROLLBACK');
                logger.error('Error creating recurring template from invoice:', error);
                return res.status(500).json({ error: 'Failed to create recurring template from invoice' });
            }
        });
    });

    return router;
};
