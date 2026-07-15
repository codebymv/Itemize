const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError, sendPaginated, getPaginationParams, buildPagination } = require('../../utils/response');
const { INVOICE_COLUMNS, INVOICE_ITEM_COLUMNS, PAYMENT_COLUMNS, selectColumns } = require('./columns');
const { allocateInvoiceNumber } = require('../../services/invoice-number.service');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Invoice CRUD
    // ======================

    /**
     * GET /api/invoices - List invoices
     */
    router.get('/', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { status, contact_id, search } = req.query;
            const { page, limit, offset } = getPaginationParams(req.query);

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

            const result = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM invoices i ${whereClause}`,
                    params
                );

                const invoicesResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS, 'i')}, c.first_name as contact_first_name, c.last_name as contact_last_name
                    FROM invoices i
                    LEFT JOIN contacts c ON i.contact_id = c.id
                    ${whereClause}
                    ORDER BY i.created_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, limit, offset]);

                return {
                    invoices: invoicesResult.rows,
                    total: parseInt(countResult.rows[0].count)
                };
            });

            const pagination = buildPagination(page, limit, result.total);
            return sendPaginated(res, result.invoices, pagination);
    }));

    /**
     * GET /api/invoices/:id - Get invoice details
     */
    router.get('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number (let other routes handle it)
            if (isNaN(parseInt(id))) {
                return next();
            }

            const invoice = await withDbClient(pool, async (client) => {
                const invoiceResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS, 'i')}, 
                        c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email,
                        b.name as business_name, b.email as business_email, b.phone as business_phone,
                        b.address as business_address, b.tax_id as business_tax_id, b.logo_url as business_logo_url
                    FROM invoices i
                    LEFT JOIN contacts c ON i.contact_id = c.id
                    LEFT JOIN businesses b ON i.business_id = b.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [parseInt(id), req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    return null;
                }

                // Get line items
                const itemsResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_ITEM_COLUMNS, 'ii')}, p.name as product_name
                    FROM invoice_items ii
                    LEFT JOIN products p ON ii.product_id = p.id
                    WHERE ii.invoice_id = $1
                    ORDER BY ii.sort_order
                `, [id]);

                // Get payments
                const paymentsResult = await client.query(`
                    SELECT ${selectColumns(PAYMENT_COLUMNS)} FROM payments WHERE invoice_id = $1 ORDER BY created_at DESC
                `, [id]);

                const invoiceData = invoiceResult.rows[0];
                invoiceData.items = itemsResult.rows;
                invoiceData.payments = paymentsResult.rows;
                
                // Include business object if business_id is set
                if (invoiceData.business_id) {
                    invoiceData.business = {
                        id: invoiceData.business_id,
                        name: invoiceData.business_name,
                        email: invoiceData.business_email,
                        phone: invoiceData.business_phone,
                        address: invoiceData.business_address,
                        tax_id: invoiceData.business_tax_id,
                        logo_url: invoiceData.business_logo_url
                    };
                }

                return invoiceData;
            });

            if (!invoice) {
                return sendNotFound(res, 'Invoice');
            }

            sendSuccess(res, invoice);
        } catch (error) {
            console.error('Error fetching invoice:', error);
            return sendError(res, 'Failed to fetch invoice');
        }
    }));

    /**
     * POST /api/invoices - Create invoice
     */
    router.post('/', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const {
                contact_id,
                business_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                issue_date,
                due_date,
                items,
                discount_type,
                discount_value,
                tax_rate,
                notes,
                terms_and_conditions,
                payment_terms
            } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return sendBadRequest(res, 'At least one line item is required');
            }

            const invoice = await withTransaction(pool, async (client) => {
                // Get next invoice number
                const invoiceNumber = await allocateInvoiceNumber(client, req.organizationId);

                // Calculate totals
                let subtotal = 0;

                for (const item of items) {
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    subtotal += itemTotal;
                }

                // Calculate tax from invoice-level tax rate
                const invoiceTaxRate = tax_rate || 0;
                const taxAmount = subtotal * (invoiceTaxRate / 100);

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

                // Calculate issue date (default to today if not provided)
                const issueDateValue = issue_date || new Date().toISOString().split('T')[0];

                // Create invoice
                const invoiceResult = await client.query(`
                    INSERT INTO invoices (
                        organization_id, invoice_number, contact_id, business_id,
                        customer_name, customer_email, customer_phone, customer_address,
                        issue_date, due_date, subtotal, tax_rate, tax_amount, discount_amount, discount_type, discount_value,
                        total, amount_due, notes, terms_and_conditions, payment_terms, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                    RETURNING ${selectColumns(INVOICE_COLUMNS)}
                `, [
                    req.organizationId,
                    invoiceNumber,
                    contact_id || null,
                    business_id || null,
                    customer_name || null,
                    customer_email || null,
                    customer_phone || null,
                    customer_address || null,
                    issueDateValue,
                    dueDateValue,
                    subtotal,
                    invoiceTaxRate,
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

                // Update last_used_at on the selected business
                if (business_id) {
                    await client.query(
                        'UPDATE businesses SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2',
                        [business_id, req.organizationId]
                    );
                }

                const invoiceId = invoiceResult.rows[0].id;

                // Create line items in bulk
                const lineItemValues = [];
                const lineItemParams = [];
                items.forEach((item, index) => {
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
                    const baseIndex = index * 11;

                    lineItemParams.push(
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
                        index
                    );

                    lineItemValues.push(
                        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
                    );
                });

                await client.query(
                    `
                        INSERT INTO invoice_items (
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        ) VALUES ${lineItemValues.join(', ')}
                    `,
                    lineItemParams
                );

                // Fetch complete invoice
                const fullInvoiceResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS)} FROM invoices WHERE id = $1
                `, [invoiceId]);

                const itemsResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_ITEM_COLUMNS)} FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
                `, [invoiceId]);

                const invoiceData = fullInvoiceResult.rows[0];
                invoiceData.items = itemsResult.rows;

                return invoiceData;
            });

            sendCreated(res, invoice);
        } catch (error) {
            console.error('Error creating invoice:', error);
            return sendError(res, 'Failed to create invoice');
        }
    }));

    /**
     * PUT /api/invoices/:id - Update invoice
     */
    router.put('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number (let other routes handle it)
            if (isNaN(parseInt(id))) {
                return next();
            }

            const {
                business_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                issue_date,
                due_date,
                items,
                discount_type,
                discount_value,
                tax_rate,
                notes,
                terms_and_conditions,
                payment_terms
            } = req.body;

            const updateResult = await withTransaction(pool, async (client) => {
                // Check if invoice can be edited
                const checkResult = await client.query(
                    'SELECT status FROM invoices WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { notFound: true };
                }

                if (!['draft', 'sent'].includes(checkResult.rows[0].status)) {
                    return { invalidStatus: true };
                }

                // Recalculate totals if items provided
                let updateFields = [];
                let updateParams = [];
                let paramIndex = 1;

                if (items && Array.isArray(items) && items.length > 0) {
                    let subtotal = 0;

                    for (const item of items) {
                        const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                        subtotal += itemTotal;
                    }

                    // Calculate tax from invoice-level tax rate
                    const invoiceTaxRate = tax_rate || 0;
                    const taxAmount = subtotal * (invoiceTaxRate / 100);

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
                    updateFields.push(`tax_rate = $${paramIndex++}`);
                    updateParams.push(invoiceTaxRate);
                    updateFields.push(`tax_amount = $${paramIndex++}`);
                    updateParams.push(taxAmount);
                    updateFields.push(`discount_amount = $${paramIndex++}`);
                    updateParams.push(discountAmount);
                    updateFields.push(`total = $${paramIndex++}`);
                    updateParams.push(total);
                    updateFields.push(`amount_due = $${paramIndex++}`);
                    updateParams.push(total);

                    // Delete existing items and recreate in bulk
                    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

                    const lineItemValues = [];
                    const lineItemParams = [];
                    items.forEach((item, index) => {
                        const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                        const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
                        const baseIndex = index * 11;

                        lineItemParams.push(
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
                            index
                        );

                        lineItemValues.push(
                            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
                        );
                    });

                    await client.query(
                        `
                            INSERT INTO invoice_items (
                                invoice_id, organization_id, product_id, name, description,
                                quantity, unit_price, tax_rate, tax_amount, total, sort_order
                            ) VALUES ${lineItemValues.join(', ')}
                        `,
                        lineItemParams
                    );
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
                if (issue_date) {
                    updateFields.push(`issue_date = $${paramIndex++}`);
                    updateParams.push(issue_date);
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
                if (business_id !== undefined) {
                    updateFields.push(`business_id = $${paramIndex++}`);
                    updateParams.push(business_id || null);
                }

                updateFields.push('updated_at = CURRENT_TIMESTAMP');

                if (updateFields.length > 1) {
                    updateParams.push(id, req.organizationId);
                    await client.query(`
                        UPDATE invoices SET ${updateFields.join(', ')}
                        WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                    `, updateParams);
                }

                // Update last_used_at on the selected business
                if (business_id) {
                    await client.query(
                        'UPDATE businesses SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2',
                        [business_id, req.organizationId]
                    );
                }

                // Fetch updated invoice
                const result = await client.query(`SELECT ${selectColumns(INVOICE_COLUMNS)} FROM invoices WHERE id = $1`, [id]);
                const itemsResult = await client.query(`SELECT ${selectColumns(INVOICE_ITEM_COLUMNS)} FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`, [id]);

                const invoice = result.rows[0];
                invoice.items = itemsResult.rows;

                return { invoice };
            });

            if (updateResult?.notFound) {
                return sendNotFound(res, 'Invoice');
            }

            if (updateResult?.invalidStatus) {
                return sendBadRequest(res, 'Cannot edit invoice in current status');
            }

            sendSuccess(res, updateResult.invoice);
        } catch (error) {
            console.error('Error updating invoice:', error);
            return sendError(res, 'Failed to update invoice');
        }
    }));

    /**
     * DELETE /api/invoices/:id - Delete invoice
     */
    router.delete('/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number (let other routes handle it)
            if (isNaN(parseInt(id))) {
                return next();
            }

            const invoiceInfo = await withDbClient(pool, async (client) => {
                // Check invoice exists
                const checkResult = await client.query(
                    'SELECT id, invoice_number FROM invoices WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return null;
                }

                // Delete invoice items first (foreign key constraint)
                await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
                
                // Delete the invoice
                await client.query('DELETE FROM invoices WHERE id = $1', [id]);

                return checkResult.rows[0];
            });

            if (!invoiceInfo) {
                return sendNotFound(res, 'Invoice');
            }

            sendSuccess(res, { success: true, invoice_number: invoiceInfo.invoice_number });
        } catch (error) {
            console.error('Error deleting invoice:', error);
            return sendError(res, 'Failed to delete invoice');
        }
    }));

    return router;
};
