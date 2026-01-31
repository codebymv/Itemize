/**
 * Estimates Routes
 * Estimate/Quote CRUD with convert-to-invoice functionality
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const emailService = require('../services/emailService');
const { sendEstimateEmail } = require('../services/invoice-email.service');

module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * Generate next estimate number
     */
    async function getNextEstimateNumber(client, organizationId) {
        // Check if we have a sequence for estimates
        const result = await client.query(`
            SELECT COALESCE(MAX(
                CAST(REGEXP_REPLACE(estimate_number, '[^0-9]', '', 'g') AS INTEGER)
            ), 0) + 1 as next_num
            FROM estimates 
            WHERE organization_id = $1
        `, [organizationId]);
        
        const nextNum = result.rows[0]?.next_num || 1;
        return `EST-${String(nextNum).padStart(5, '0')}`;
    }

    /**
     * GET /api/invoices/estimates - List estimates
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, contact_id, page = 1, limit = 20, search } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE e.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND e.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (contact_id) {
                whereClause += ` AND e.contact_id = $${paramIndex}`;
                params.push(parseInt(contact_id));
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND (e.estimate_number ILIKE $${paramIndex} OR e.customer_name ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const result = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM estimates e ${whereClause}`,
                    params
                );

                const estimatesResult = await client.query(`
                    SELECT e.*, c.first_name as contact_first_name, c.last_name as contact_last_name
                    FROM estimates e
                    LEFT JOIN contacts c ON e.contact_id = c.id
                    ${whereClause}
                    ORDER BY e.created_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return { rows: estimatesResult.rows, total: parseInt(countResult.rows[0].count) };
            });

            sendSuccess(res, {
                estimates: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    totalPages: Math.ceil(result.total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching estimates:', error);
            sendError(res, 'Failed to fetch estimates');
        }
    });

    /**
     * GET /api/invoices/estimates/:id - Get estimate details
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const estimateResult = await client.query(`
                    SELECT e.*, c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email
                    FROM estimates e
                    LEFT JOIN contacts c ON e.contact_id = c.id
                    WHERE e.id = $1 AND e.organization_id = $2
                `, [id, req.organizationId]);

                if (estimateResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const itemsResult = await client.query(`
                    SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order
                `, [id]);

                const estimate = estimateResult.rows[0];
                estimate.items = itemsResult.rows;
                return { status: 'ok', estimate };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Estimate');
            }

            sendSuccess(res, result.estimate);
        } catch (error) {
            console.error('Error fetching estimate:', error);
            sendError(res, 'Failed to fetch estimate');
        }
    });

    /**
     * POST /api/invoices/estimates - Create estimate
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                contact_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                valid_until,
                items,
                discount_type,
                discount_value,
                notes,
                terms_and_conditions
            } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return sendBadRequest(res, 'At least one line item is required');
            }

            const estimate = await withTransaction(pool, async (client) => {
                const estimateNumber = await getNextEstimateNumber(client, req.organizationId);

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

                // Default valid_until to 30 days from now
                let validUntilDate = valid_until;
                if (!validUntilDate) {
                    const date = new Date();
                    date.setDate(date.getDate() + 30);
                    validUntilDate = date.toISOString().split('T')[0];
                }

                // Create estimate
                const estimateResult = await client.query(`
                    INSERT INTO estimates (
                        organization_id, estimate_number, contact_id,
                        customer_name, customer_email, customer_phone, customer_address,
                        valid_until, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                        total, notes, terms_and_conditions, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    RETURNING *
                `, [
                    req.organizationId,
                    estimateNumber,
                    contact_id || null,
                    customer_name || null,
                    customer_email || null,
                    customer_phone || null,
                    customer_address || null,
                    validUntilDate,
                    subtotal,
                    taxAmount,
                    discountAmount,
                    discount_type || null,
                    discount_value || 0,
                    total,
                    notes || null,
                    terms_and_conditions || null,
                    req.user.id
                ]);

                const estimateId = estimateResult.rows[0].id;

                // Create line items
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                    await client.query(`
                        INSERT INTO estimate_items (
                            estimate_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        estimateId,
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

                const fullEstimateResult = await client.query(`
                    SELECT * FROM estimates WHERE id = $1
                `, [estimateId]);

                const itemsResult = await client.query(`
                    SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order
                `, [estimateId]);

                const createdEstimate = fullEstimateResult.rows[0];
                createdEstimate.items = itemsResult.rows;

                return createdEstimate;
            });

            sendCreated(res, estimate);
        } catch (error) {
            console.error('Error creating estimate:', error);
            sendError(res, 'Failed to create estimate');
        }
    });

    /**
     * PUT /api/invoices/estimates/:id - Update estimate
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                valid_until,
                items,
                discount_type,
                discount_value,
                notes,
                terms_and_conditions
            } = req.body;

            const result = await withTransaction(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT status FROM estimates WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                if (!['draft', 'sent'].includes(checkResult.rows[0].status)) {
                    return { status: 'invalid_status' };
                }

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

                    // Delete existing items and recreate
                    await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [id]);

                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                        const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                        await client.query(`
                            INSERT INTO estimate_items (
                                estimate_id, organization_id, product_id, name, description,
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
                if (valid_until) {
                    updateFields.push(`valid_until = $${paramIndex++}`);
                    updateParams.push(valid_until);
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

                updateFields.push('updated_at = CURRENT_TIMESTAMP');

                if (updateFields.length > 1) {
                    updateParams.push(id, req.organizationId);
                    await client.query(`
                        UPDATE estimates SET ${updateFields.join(', ')}
                        WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
                    `, updateParams);
                }

                const estimateResult = await client.query('SELECT * FROM estimates WHERE id = $1', [id]);
                const itemsResult = await client.query('SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order', [id]);

                const estimate = estimateResult.rows[0];
                estimate.items = itemsResult.rows;

                return { status: 'ok', estimate };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Estimate');
            }

            if (result.status === 'invalid_status') {
                return sendBadRequest(res, 'Cannot edit estimate in current status');
            }

            sendSuccess(res, result.estimate);
        } catch (error) {
            console.error('Error updating estimate:', error);
            sendError(res, 'Failed to update estimate');
        }
    });

    /**
     * DELETE /api/invoices/estimates/:id - Delete estimate
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM estimates WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Estimate');
            }

            sendSuccess(res, { success: true });
        } catch (error) {
            console.error('Error deleting estimate:', error);
            sendError(res, 'Failed to delete estimate');
        }
    });

    /**
     * POST /api/invoices/estimates/:id/send - Send estimate
     */
    router.post('/:id/send', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                // Fetch estimate with business info
                const estimateResult = await client.query(`
                    SELECT e.*, 
                           b.name as business_name, 
                           b.email as business_email,
                           b.phone as business_phone,
                           b.address as business_address,
                           b.logo_url as business_logo_url,
                           b.tax_id as business_tax_id
                    FROM estimates e
                    LEFT JOIN businesses b ON e.business_id = b.id
                    WHERE e.id = $1 AND e.organization_id = $2
                `, [id, req.organizationId]);

                if (estimateResult.rows.length === 0) {
                    return { errorStatus: 404, error: 'Estimate not found' };
                }

                const estimate = estimateResult.rows[0];

                // Check if estimate can be sent
                const allowedStatuses = ['draft', 'sent'];
                if (!allowedStatuses.includes(estimate.status)) {
                    return { errorStatus: 400, error: 'Estimate cannot be sent in current status' };
                }

                // Check if customer email exists
                if (!estimate.customer_email) {
                    return { errorStatus: 400, error: 'Customer email is required to send estimate' };
                }

                // Fetch estimate items for PDF generation
                const itemsResult = await client.query(`
                    SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order
                `, [id]);
                estimate.items = itemsResult.rows;

                // Fetch payment settings for business info (fallback)
                const settingsResult = await client.query(`
                    SELECT * FROM payment_settings WHERE organization_id = $1
                `, [req.organizationId]);

                const settings = settingsResult.rows[0] || {};

                // Use business info from estimate or fall back to settings
                estimate.business = {
                    name: estimate.business_name,
                    email: estimate.business_email,
                    phone: estimate.business_phone,
                    address: estimate.business_address,
                    logo_url: estimate.business_logo_url,
                    tax_id: estimate.business_tax_id
                };

                if (!estimate.business.name) {
                    estimate.business.name = settings.business_name;
                    estimate.business.email = settings.business_email;
                    estimate.business.phone = settings.business_phone;
                    estimate.business.address = settings.business_address;
                    estimate.business.logo_url = settings.logo_url;
                    estimate.business.tax_id = settings.tax_id;
                }

                // Fallback to settings logo_url if business doesn't have one
                if (!estimate.business.logo_url && settings.logo_url) {
                    estimate.business.logo_url = settings.logo_url;
                }

                // Log logo URL for debugging
                logger.info(`Estimate ${estimate.estimate_number} - Business logo_url: ${estimate.business.logo_url || 'none'}, Settings logo_url: ${settings.logo_url || 'none'}`);

                // Generate PDF for attachment
                let pdfBuffer = null;
                try {
                    const { generateEstimatePDF, isEstimatePDFAvailable } = require('../services/pdf.service');
                    if (isEstimatePDFAvailable()) {
                        pdfBuffer = await generateEstimatePDF(estimate);
                        logger.info(`Generated PDF for estimate ${estimate.estimate_number}, size: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
                        logger.info(`PDF buffer type: ${pdfBuffer ? pdfBuffer.constructor.name : 'null'}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}`);
                    } else {
                        logger.warn('PDF generation not available (puppeteer not installed) - sending email without attachment');
                    }
                } catch (pdfErr) {
                    logger.error('Error generating estimate PDF:', pdfErr);
                    logger.error('PDF error details:', pdfErr.stack);
                    // Continue without PDF attachment
                }

                // Update estimate status to 'sent' only if not already sent
                let updatedEstimate = estimate;
                if (estimate.status === 'draft') {
                    const updateResult = await client.query(`
                        UPDATE estimates SET
                            status = 'sent',
                            sent_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1 AND organization_id = $2
                        RETURNING *
                    `, [id, req.organizationId]);
                    updatedEstimate = updateResult.rows[0];
                }

                // Attempt to send email
                let emailSent = false;
                let emailError = null;

                if (emailService.isEnabled()) {
                    try {
                        // Send using estimate email service with PDF attachment
                        emailSent = await sendEstimateEmail(
                            emailService,
                            updatedEstimate,
                            { ...settings, business_name: estimate.business.name || settings.business_name, business_email: estimate.business.email || settings.business_email },
                            pdfBuffer
                        );

                        if (emailSent) {
                            logger.info(`Estimate ${updatedEstimate.estimate_number} email sent to ${updatedEstimate.customer_email}${pdfBuffer ? ' with PDF' : ''}`);
                        } else {
                            emailError = 'Email service returned false';
                            logger.warn(`Failed to send estimate ${updatedEstimate.estimate_number} email`);
                        }
                    } catch (emailErr) {
                        logger.error('Error sending estimate email:', emailErr);
                        emailError = emailErr.message;
                    }
                } else {
                    logger.warn('Email service not configured - estimate marked as sent but no email delivered');
                    emailError = 'Email service not configured';
                }

                return {
                    data: {
                        ...updatedEstimate,
                        emailSent,
                        emailError: emailError || undefined
                    }
                };
            });

            if (result.errorStatus) {
                return sendError(res, result.error, result.errorStatus);
            }

            sendSuccess(res, result.data);
        } catch (error) {
            logger.error('Error sending estimate:', error);
            return sendError(res, 'Failed to send estimate');
        }
    });

    /**
     * POST /api/invoices/estimates/:id/convert-to-invoice - Convert estimate to invoice
     */
    router.post('/:id/convert-to-invoice', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withTransaction(pool, async (client) => {
                const estimateResult = await client.query(`
                    SELECT * FROM estimates WHERE id = $1 AND organization_id = $2
                `, [id, req.organizationId]);

                if (estimateResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const estimate = estimateResult.rows[0];

                if (estimate.converted_invoice_id) {
                    return { status: 'already_converted' };
                }

                const itemsResult = await client.query(`
                    SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order
                `, [id]);

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

                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);

                const invoiceResult = await client.query(`
                    INSERT INTO invoices (
                        organization_id, invoice_number, contact_id,
                        customer_name, customer_email, customer_phone, customer_address,
                        due_date, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                        total, amount_due, notes, terms_and_conditions, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                    RETURNING *
                `, [
                    req.organizationId,
                    invoiceNumber,
                    estimate.contact_id,
                    estimate.customer_name,
                    estimate.customer_email,
                    estimate.customer_phone,
                    estimate.customer_address,
                    dueDate.toISOString().split('T')[0],
                    estimate.subtotal,
                    estimate.tax_amount,
                    estimate.discount_amount,
                    estimate.discount_type,
                    estimate.discount_value,
                    estimate.total,
                    estimate.total,
                    estimate.notes,
                    estimate.terms_and_conditions,
                    req.user.id
                ]);

                const invoiceId = invoiceResult.rows[0].id;

                for (const item of itemsResult.rows) {
                    await client.query(`
                        INSERT INTO invoice_items (
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        invoiceId,
                        req.organizationId,
                        item.product_id,
                        item.name,
                        item.description,
                        item.quantity,
                        item.unit_price,
                        item.tax_rate,
                        item.tax_amount,
                        item.total,
                        item.sort_order
                    ]);
                }

                await client.query(`
                    UPDATE estimates SET
                        converted_invoice_id = $1,
                        status = 'accepted',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [invoiceId, id]);

                return { status: 'ok', invoiceId, invoiceNumber };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Estimate');
            }

            if (result.status === 'already_converted') {
                return sendBadRequest(res, 'Estimate already converted to invoice');
            }

            sendSuccess(res, {
                success: true,
                invoice_id: result.invoiceId,
                invoice_number: result.invoiceNumber
            });
        } catch (error) {
            console.error('Error converting estimate to invoice:', error);
            sendError(res, 'Failed to convert estimate to invoice');
        }
    });

    return router;
};
