/**
 * Invoices Routes
 * Invoice CRUD, payments, and Stripe integration
 * Refactored with shared middleware (Phase 5)
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');

// Stripe initialization (will be null if not configured)
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
} catch (e) {
    logger.info('Stripe not configured - payment features limited');
}

module.exports = (pool, authenticateJWT, publicRateLimit) => {
    // Use shared organization middleware (Phase 5.3)
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Generate next invoice number
     */
    async function getNextInvoiceNumber(client, organizationId) {
        const settingsResult = await client.query(
            'SELECT invoice_prefix, next_invoice_number FROM payment_settings WHERE organization_id = $1',
            [organizationId]
        );

        let prefix = 'INV-';
        let nextNumber = 1;

        if (settingsResult.rows.length > 0) {
            prefix = settingsResult.rows[0].invoice_prefix || 'INV-';
            nextNumber = settingsResult.rows[0].next_invoice_number || 1;

            // Increment for next time
            await client.query(
                'UPDATE payment_settings SET next_invoice_number = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2',
                [nextNumber + 1, organizationId]
            );
        } else {
            // Create settings if not exists
            await client.query(`
                INSERT INTO payment_settings (organization_id, next_invoice_number)
                VALUES ($1, 2)
            `, [organizationId]);
        }

        return `${prefix}${String(nextNumber).padStart(5, '0')}`;
    }

    // ======================
    // Products CRUD
    // ======================

    /**
     * GET /api/invoices/products - List products
     */
    router.get('/products', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { is_active, search } = req.query;
            const client = await pool.connect();

            let query = `
                SELECT * FROM products WHERE organization_id = $1
            `;
            const params = [req.organizationId];
            let paramIndex = 2;

            if (is_active !== undefined) {
                query += ` AND is_active = $${paramIndex}`;
                params.push(is_active === 'true');
                paramIndex++;
            }

            if (search) {
                query += ` AND (name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
            }

            query += ' ORDER BY name ASC';

            const result = await client.query(query, params);
            client.release();

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching products:', error);
            res.status(500).json({ error: 'Failed to fetch products' });
        }
    });

    /**
     * POST /api/invoices/products - Create product
     */
    router.post('/products', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable } = req.body;

            if (!name || price === undefined) {
                return res.status(400).json({ error: 'Name and price are required' });
            }

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO products (
                    organization_id, name, description, sku, price, currency,
                    product_type, billing_period, tax_rate, taxable, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `, [
                req.organizationId,
                name,
                description || null,
                sku || null,
                price,
                currency || 'USD',
                product_type || 'one_time',
                billing_period || null,
                tax_rate || 0,
                taxable !== false,
                req.user.id
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating product:', error);
            res.status(500).json({ error: 'Failed to create product' });
        }
    });

    /**
     * PUT /api/invoices/products/:id - Update product
     */
    router.put('/products/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable, is_active } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
                UPDATE products SET
                    name = COALESCE($1, name),
                    description = $2,
                    sku = $3,
                    price = COALESCE($4, price),
                    currency = COALESCE($5, currency),
                    product_type = COALESCE($6, product_type),
                    billing_period = $7,
                    tax_rate = COALESCE($8, tax_rate),
                    taxable = COALESCE($9, taxable),
                    is_active = COALESCE($10, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $11 AND organization_id = $12
                RETURNING *
            `, [name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable, is_active, id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Product not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating product:', error);
            res.status(500).json({ error: 'Failed to update product' });
        }
    });

    /**
     * DELETE /api/invoices/products/:id - Delete product
     */
    router.delete('/products/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM products WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Product not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting product:', error);
            res.status(500).json({ error: 'Failed to delete product' });
        }
    });

    // ======================
    // Invoice CRUD
    // ======================

    /**
     * GET /api/invoices - List invoices
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, contact_id, page = 1, limit = 20, search } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE i.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND i.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (contact_id) {
                whereClause += ` AND i.contact_id = $${paramIndex}`;
                params.push(parseInt(contact_id));
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND (i.invoice_number ILIKE $${paramIndex} OR i.customer_name ILIKE $${paramIndex} OR i.customer_email ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM invoices i ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT i.*, c.first_name as contact_first_name, c.last_name as contact_last_name
                FROM invoices i
                LEFT JOIN contacts c ON i.contact_id = c.id
                ${whereClause}
                ORDER BY i.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                invoices: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching invoices:', error);
            res.status(500).json({ error: 'Failed to fetch invoices' });
        }
    });

    /**
     * GET /api/invoices/:id - Get invoice details
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const invoiceResult = await client.query(`
                SELECT i.*, c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                FROM invoices i
                LEFT JOIN contacts c ON i.contact_id = c.id
                WHERE i.id = $1 AND i.organization_id = $2
            `, [id, req.organizationId]);

            if (invoiceResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            // Get line items
            const itemsResult = await client.query(`
                SELECT ii.*, p.name as product_name
                FROM invoice_items ii
                LEFT JOIN products p ON ii.product_id = p.id
                WHERE ii.invoice_id = $1
                ORDER BY ii.sort_order
            `, [id]);

            // Get payments
            const paymentsResult = await client.query(`
                SELECT * FROM payments WHERE invoice_id = $1 ORDER BY created_at DESC
            `, [id]);

            client.release();

            const invoice = invoiceResult.rows[0];
            invoice.items = itemsResult.rows;
            invoice.payments = paymentsResult.rows;

            res.json(invoice);
        } catch (error) {
            console.error('Error fetching invoice:', error);
            res.status(500).json({ error: 'Failed to fetch invoice' });
        }
    });

    /**
     * POST /api/invoices - Create invoice
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                contact_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                due_date,
                items,
                discount_type,
                discount_value,
                notes,
                terms_and_conditions,
                payment_terms
            } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'At least one line item is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Get next invoice number
                const invoiceNumber = await getNextInvoiceNumber(client, req.organizationId);

                // Calculate totals
                let subtotal = 0;
                let taxAmount = 0;

                for (const item of items) {
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
                    subtotal += itemTotal;
                    taxAmount += itemTax;
                }

                // Apply discount
                let discountAmount = 0;
                if (discount_value && discount_value > 0) {
                    if (discount_type === 'percent') {
                        discountAmount = subtotal * (discount_value / 100);
                    } else {
                        discountAmount = discount_value;
                    }
                }

                const total = subtotal + taxAmount - discountAmount;

                // Calculate due date
                let dueDateValue = due_date;
                if (!dueDateValue) {
                    const settingsResult = await client.query(
                        'SELECT default_payment_terms FROM payment_settings WHERE organization_id = $1',
                        [req.organizationId]
                    );
                    const terms = settingsResult.rows[0]?.default_payment_terms || 30;
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + terms);
                    dueDateValue = dueDate.toISOString().split('T')[0];
                }

                // Create invoice
                const invoiceResult = await client.query(`
                    INSERT INTO invoices (
                        organization_id, invoice_number, contact_id,
                        customer_name, customer_email, customer_phone, customer_address,
                        due_date, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                        total, amount_due, notes, terms_and_conditions, payment_terms, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    RETURNING *
                `, [
                    req.organizationId,
                    invoiceNumber,
                    contact_id || null,
                    customer_name || null,
                    customer_email || null,
                    customer_phone || null,
                    customer_address || null,
                    dueDateValue,
                    subtotal,
                    taxAmount,
                    discountAmount,
                    discount_type || null,
                    discount_value || 0,
                    total,
                    total,
                    notes || null,
                    terms_and_conditions || null,
                    payment_terms || null,
                    req.user.id
                ]);

                const invoiceId = invoiceResult.rows[0].id;

                // Create line items
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

                await client.query('COMMIT');

                // Fetch complete invoice
                const fullInvoiceResult = await client.query(`
                    SELECT * FROM invoices WHERE id = $1
                `, [invoiceId]);

                const itemsResult = await client.query(`
                    SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
                `, [invoiceId]);

                client.release();

                const invoice = fullInvoiceResult.rows[0];
                invoice.items = itemsResult.rows;

                res.status(201).json(invoice);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error creating invoice:', error);
            res.status(500).json({ error: 'Failed to create invoice' });
        }
    });

    /**
     * PUT /api/invoices/:id - Update invoice
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                due_date,
                items,
                discount_type,
                discount_value,
                notes,
                terms_and_conditions,
                payment_terms
            } = req.body;

            const client = await pool.connect();

            // Check if invoice can be edited
            const checkResult = await client.query(
                'SELECT status FROM invoices WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            if (!['draft', 'sent'].includes(checkResult.rows[0].status)) {
                client.release();
                return res.status(400).json({ error: 'Cannot edit invoice in current status' });
            }

            try {
                await client.query('BEGIN');

                // Recalculate totals if items provided
                let updateFields = [];
                let updateParams = [];
                let paramIndex = 1;

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

                    updateFields.push(`subtotal = $${paramIndex++}`);
                    updateParams.push(subtotal);
                    updateFields.push(`tax_amount = $${paramIndex++}`);
                    updateParams.push(taxAmount);
                    updateFields.push(`discount_amount = $${paramIndex++}`);
                    updateParams.push(discountAmount);
                    updateFields.push(`total = $${paramIndex++}`);
                    updateParams.push(total);
                    updateFields.push(`amount_due = $${paramIndex++}`);
                    updateParams.push(total);

                    // Delete existing items and recreate
                    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

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
                            id,
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
                }

                // Add other fields
                if (customer_name !== undefined) {
                    updateFields.push(`customer_name = $${paramIndex++}`);
                    updateParams.push(customer_name);
                }
                if (customer_email !== undefined) {
                    updateFields.push(`customer_email = $${paramIndex++}`);
                    updateParams.push(customer_email);
                }
                if (customer_phone !== undefined) {
                    updateFields.push(`customer_phone = $${paramIndex++}`);
                    updateParams.push(customer_phone);
                }
                if (customer_address !== undefined) {
                    updateFields.push(`customer_address = $${paramIndex++}`);
                    updateParams.push(customer_address);
                }
                if (due_date) {
                    updateFields.push(`due_date = $${paramIndex++}`);
                    updateParams.push(due_date);
                }
                if (discount_type !== undefined) {
                    updateFields.push(`discount_type = $${paramIndex++}`);
                    updateParams.push(discount_type);
                }
                if (discount_value !== undefined) {
                    updateFields.push(`discount_value = $${paramIndex++}`);
                    updateParams.push(discount_value);
                }
                if (notes !== undefined) {
                    updateFields.push(`notes = $${paramIndex++}`);
                    updateParams.push(notes);
                }
                if (terms_and_conditions !== undefined) {
                    updateFields.push(`terms_and_conditions = $${paramIndex++}`);
                    updateParams.push(terms_and_conditions);
                }
                if (payment_terms !== undefined) {
                    updateFields.push(`payment_terms = $${paramIndex++}`);
                    updateParams.push(payment_terms);
                }

                updateFields.push('updated_at = CURRENT_TIMESTAMP');

                if (updateFields.length > 1) {
                    updateParams.push(id, req.organizationId);
                    await client.query(`
                        UPDATE invoices SET ${updateFields.join(', ')}
                        WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                    `, updateParams);
                }

                await client.query('COMMIT');

                // Fetch updated invoice
                const result = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
                const itemsResult = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order', [id]);

                client.release();

                const invoice = result.rows[0];
                invoice.items = itemsResult.rows;

                res.json(invoice);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error updating invoice:', error);
            res.status(500).json({ error: 'Failed to update invoice' });
        }
    });

    /**
     * DELETE /api/invoices/:id - Delete invoice
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Only allow deleting draft invoices
            const checkResult = await client.query(
                'SELECT status FROM invoices WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            if (checkResult.rows[0].status !== 'draft') {
                client.release();
                return res.status(400).json({ error: 'Can only delete draft invoices' });
            }

            await client.query('DELETE FROM invoices WHERE id = $1', [id]);
            client.release();

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting invoice:', error);
            res.status(500).json({ error: 'Failed to delete invoice' });
        }
    });

    // ======================
    // Invoice Actions
    // ======================

    /**
     * POST /api/invoices/:id/send - Send invoice to customer
     */
    router.post('/:id/send', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
                UPDATE invoices SET
                    status = 'sent',
                    sent_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'sent')
                RETURNING *
            `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Invoice not found or cannot be sent' });
            }

            // TODO: Actually send email with invoice
            // For now, just update status

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error sending invoice:', error);
            res.status(500).json({ error: 'Failed to send invoice' });
        }
    });

    /**
     * POST /api/invoices/:id/record-payment - Record manual payment
     */
    router.post('/:id/record-payment', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { amount, payment_method, notes } = req.body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: 'Valid amount is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Get invoice
                const invoiceResult = await client.query(
                    'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (invoiceResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    return res.status(404).json({ error: 'Invoice not found' });
                }

                const invoice = invoiceResult.rows[0];

                // Create payment record
                const paymentResult = await client.query(`
                    INSERT INTO payments (
                        organization_id, invoice_id, contact_id, amount, currency,
                        payment_method, status, notes, paid_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, CURRENT_TIMESTAMP)
                    RETURNING *
                `, [
                    req.organizationId,
                    id,
                    invoice.contact_id,
                    amount,
                    invoice.currency,
                    payment_method || 'other',
                    notes || null
                ]);

                // Update invoice
                const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
                const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
                const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                await client.query(`
                    UPDATE invoices SET
                        amount_paid = $1,
                        amount_due = $2,
                        status = $3,
                        paid_at = CASE WHEN $3 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4
                `, [newAmountPaid, Math.max(0, newAmountDue), newStatus, id]);

                await client.query('COMMIT');
                client.release();

                res.json({
                    payment: paymentResult.rows[0],
                    invoice: {
                        amount_paid: newAmountPaid,
                        amount_due: Math.max(0, newAmountDue),
                        status: newStatus
                    }
                });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error recording payment:', error);
            res.status(500).json({ error: 'Failed to record payment' });
        }
    });

    /**
     * POST /api/invoices/:id/create-payment-link - Create Stripe payment link
     */
    router.post('/:id/create-payment-link', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            if (!stripe) {
                return res.status(400).json({ error: 'Stripe not configured' });
            }

            const { id } = req.params;
            const client = await pool.connect();

            const invoiceResult = await client.query(
                'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (invoiceResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const invoice = invoiceResult.rows[0];

            if (invoice.amount_due <= 0) {
                client.release();
                return res.status(400).json({ error: 'Invoice already paid' });
            }

            // Create Stripe payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(invoice.amount_due * 100), // Convert to cents
                currency: invoice.currency.toLowerCase(),
                metadata: {
                    invoice_id: invoice.id.toString(),
                    invoice_number: invoice.invoice_number,
                    organization_id: req.organizationId.toString()
                }
            });

            // Update invoice with Stripe info
            await client.query(`
                UPDATE invoices SET
                    stripe_payment_intent_id = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [paymentIntent.id, id]);

            client.release();

            res.json({
                client_secret: paymentIntent.client_secret,
                payment_intent_id: paymentIntent.id
            });
        } catch (error) {
            console.error('Error creating payment link:', error);
            res.status(500).json({ error: 'Failed to create payment link' });
        }
    });

    // ======================
    // Payment Settings
    // ======================

    /**
     * GET /api/invoices/settings - Get payment settings
     */
    router.get('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();

            const result = await client.query(
                'SELECT * FROM payment_settings WHERE organization_id = $1',
                [req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.json({
                    invoice_prefix: 'INV-',
                    next_invoice_number: 1,
                    default_payment_terms: 30,
                    default_tax_rate: 0,
                    default_currency: 'USD',
                    stripe_connected: false
                });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching payment settings:', error);
            res.status(500).json({ error: 'Failed to fetch payment settings' });
        }
    });

    /**
     * PUT /api/invoices/settings - Update payment settings
     */
    router.put('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                invoice_prefix,
                default_payment_terms,
                default_notes,
                default_terms,
                default_tax_rate,
                tax_id,
                business_name,
                business_address,
                business_phone,
                business_email,
                logo_url,
                default_currency
            } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO payment_settings (
                    organization_id, invoice_prefix, default_payment_terms, default_notes, default_terms,
                    default_tax_rate, tax_id, business_name, business_address, business_phone,
                    business_email, logo_url, default_currency
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (organization_id) DO UPDATE SET
                    invoice_prefix = COALESCE(EXCLUDED.invoice_prefix, payment_settings.invoice_prefix),
                    default_payment_terms = COALESCE(EXCLUDED.default_payment_terms, payment_settings.default_payment_terms),
                    default_notes = EXCLUDED.default_notes,
                    default_terms = EXCLUDED.default_terms,
                    default_tax_rate = COALESCE(EXCLUDED.default_tax_rate, payment_settings.default_tax_rate),
                    tax_id = EXCLUDED.tax_id,
                    business_name = EXCLUDED.business_name,
                    business_address = EXCLUDED.business_address,
                    business_phone = EXCLUDED.business_phone,
                    business_email = EXCLUDED.business_email,
                    logo_url = EXCLUDED.logo_url,
                    default_currency = COALESCE(EXCLUDED.default_currency, payment_settings.default_currency),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                req.organizationId,
                invoice_prefix || 'INV-',
                default_payment_terms || 30,
                default_notes || null,
                default_terms || null,
                default_tax_rate || 0,
                tax_id || null,
                business_name || null,
                business_address || null,
                business_phone || null,
                business_email || null,
                logo_url || null,
                default_currency || 'USD'
            ]);

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating payment settings:', error);
            res.status(500).json({ error: 'Failed to update payment settings' });
        }
    });

    // ======================
    // Stripe Webhooks
    // ======================

    /**
     * POST /api/invoices/webhook/stripe - Stripe webhook handler
     */
    router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
        if (!stripe) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const sig = req.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            if (endpointSecret) {
                event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            } else {
                event = JSON.parse(req.body);
            }
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        const client = await pool.connect();

        try {
            switch (event.type) {
                case 'payment_intent.succeeded':
                    const paymentIntent = event.data.object;
                    const invoiceId = paymentIntent.metadata?.invoice_id;

                    if (invoiceId) {
                        // Record payment
                        await client.query(`
                            INSERT INTO payments (
                                organization_id, invoice_id, amount, currency, payment_method, status,
                                stripe_payment_intent_id, card_last4, card_brand, paid_at
                            ) VALUES (
                                $1, $2, $3, $4, 'stripe', 'succeeded', $5, $6, $7, CURRENT_TIMESTAMP
                            )
                        `, [
                            paymentIntent.metadata.organization_id,
                            invoiceId,
                            paymentIntent.amount / 100,
                            paymentIntent.currency.toUpperCase(),
                            paymentIntent.id,
                            paymentIntent.charges?.data[0]?.payment_method_details?.card?.last4,
                            paymentIntent.charges?.data[0]?.payment_method_details?.card?.brand
                        ]);

                        // Update invoice
                        const invoiceResult = await client.query(
                            'SELECT total, amount_paid FROM invoices WHERE id = $1',
                            [invoiceId]
                        );

                        if (invoiceResult.rows.length > 0) {
                            const invoice = invoiceResult.rows[0];
                            const newAmountPaid = parseFloat(invoice.amount_paid) + (paymentIntent.amount / 100);
                            const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
                            const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                            await client.query(`
                                UPDATE invoices SET
                                    amount_paid = $1,
                                    amount_due = $2,
                                    status = $3,
                                    paid_at = CASE WHEN $3 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = $4
                            `, [newAmountPaid, Math.max(0, newAmountDue), newStatus, invoiceId]);
                        }
                    }
                    break;

                case 'payment_intent.payment_failed':
                    const failedPayment = event.data.object;
                    const failedInvoiceId = failedPayment.metadata?.invoice_id;

                    if (failedInvoiceId) {
                        await client.query(`
                            INSERT INTO payments (
                                organization_id, invoice_id, amount, currency, payment_method, status,
                                stripe_payment_intent_id, description
                            ) VALUES ($1, $2, $3, $4, 'stripe', 'failed', $5, $6)
                        `, [
                            failedPayment.metadata.organization_id,
                            failedInvoiceId,
                            failedPayment.amount / 100,
                            failedPayment.currency.toUpperCase(),
                            failedPayment.id,
                            failedPayment.last_payment_error?.message || 'Payment failed'
                        ]);
                    }
                    break;
            }

            client.release();
            res.json({ received: true });
        } catch (error) {
            client.release();
            console.error('Error processing Stripe webhook:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });

    return router;
};
