/**
 * Recurring Invoices Routes
 * Manage recurring invoice templates
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

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
            const client = await pool.connect();
            
            const settingsResult = await client.query(
                'SELECT invoice_prefix, next_invoice_number FROM payment_settings WHERE organization_id = $1',
                [req.organizationId]
            );

            let prefix = 'INV-';
            let nextNumber = 1;

            if (settingsResult.rows.length > 0) {
                prefix = settingsResult.rows[0].invoice_prefix || 'INV-';
                nextNumber = settingsResult.rows[0].next_invoice_number || 1;
            }

            const previewNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;
            
            client.release();
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
            const client = await pool.connect();

            let whereClause = 'WHERE r.organization_id = $1';
            const params = [req.organizationId];

            if (status && status !== 'all') {
                whereClause += ' AND r.status = $2';
                params.push(status);
            }

            const result = await client.query(`
                SELECT r.*, 
                    c.first_name as contact_first_name, 
                    c.last_name as contact_last_name,
                    (SELECT COUNT(*) FROM invoices i WHERE i.recurring_template_id = r.id) as invoices_generated
                FROM recurring_invoice_templates r
                LEFT JOIN contacts c ON r.contact_id = c.id
                ${whereClause}
                ORDER BY r.created_at DESC
            `, params);

            client.release();

            res.json({
                recurring: result.rows
            });
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
            const client = await pool.connect();

            const result = await client.query(`
                SELECT r.*, c.first_name as contact_first_name, c.last_name as contact_last_name
                FROM recurring_invoice_templates r
                LEFT JOIN contacts c ON r.contact_id = c.id
                WHERE r.id = $1 AND r.organization_id = $2
            `, [id, req.organizationId]);

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Recurring invoice not found' });
            }

            client.release();
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

            const client = await pool.connect();

            const result = await client.query(`
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

            client.release();
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

            const client = await pool.connect();

            // Check if exists
            const checkResult = await client.query(
                'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Recurring invoice not found' });
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
            const result = await client.query(`
                UPDATE recurring_invoice_templates 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                RETURNING *
            `, updateParams);

            client.release();
            res.json(result.rows[0]);
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
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

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
            const client = await pool.connect();

            const result = await client.query(`
                UPDATE recurring_invoice_templates 
                SET status = 'paused', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2 AND status = 'active'
                RETURNING *
            `, [id, req.organizationId]);

            client.release();

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
            const client = await pool.connect();

            // Get current template
            const template = await client.query(
                'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (template.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Recurring invoice not found' });
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

            const result = await client.query(`
                UPDATE recurring_invoice_templates 
                SET status = 'active', next_run_date = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2 AND status = 'paused'
                RETURNING *
            `, [id, req.organizationId, nextRunDate]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Recurring invoice not found or not paused' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error resuming recurring invoice:', error);
            res.status(500).json({ error: 'Failed to resume recurring invoice' });
        }
    });

    /**
     * GET /api/invoices/recurring/:id/history - Get generated invoices history
     */
    router.get('/:id/history', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                SELECT i.id, i.invoice_number, i.total, i.status, i.created_at
                FROM invoices i
                WHERE i.recurring_template_id = $1 AND i.organization_id = $2
                ORDER BY i.created_at DESC
            `, [id, req.organizationId]);

            client.release();
            res.json({ invoices: result.rows });
        } catch (error) {
            console.error('Error fetching recurring invoice history:', error);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    });

    /**
     * POST /api/invoices/recurring/from-invoice/:invoiceId - Convert invoice to recurring template
     * Creates a recurring template from an existing invoice and deletes the original
     */
    router.post('/from-invoice/:invoiceId', authenticateJWT, requireOrganization, async (req, res) => {
        const client = await pool.connect();
        
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

            // Create the recurring template
            const templateResult = await client.query(`
                INSERT INTO recurring_invoice_templates (
                    organization_id, template_name, contact_id, customer_name, customer_email,
                    frequency, start_date, end_date, next_run_date,
                    items, subtotal, tax_amount, discount_amount, discount_type, discount_value, total,
                    notes, payment_terms, created_by, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'active')
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
                req.user.id
            ]);

            const newTemplate = templateResult.rows[0];

            // Delete the original invoice items first (due to foreign key)
            await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);

            // Delete the original invoice
            await client.query('DELETE FROM invoices WHERE id = $1 AND organization_id = $2', [invoiceId, req.organizationId]);

            // Commit transaction
            await client.query('COMMIT');

            logger.info('Invoice converted to recurring template', {
                invoiceId,
                templateId: newTemplate.id,
                organizationId: req.organizationId,
                userId: req.user.id
            });

            res.status(201).json({
                success: true,
                template: newTemplate,
                message: 'Invoice successfully converted to recurring template'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error converting invoice to recurring:', error);
            res.status(500).json({ error: 'Failed to convert invoice to recurring template' });
        } finally {
            client.release();
        }
    });

    return router;
};
