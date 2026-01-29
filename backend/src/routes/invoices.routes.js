/**
 * Invoices Routes
 * Invoice CRUD, payments, and Stripe integration
 * Refactored with shared middleware (Phase 5)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError, sendPaginated, getPaginationParams, buildPagination } = require('../utils/response');

// Email services for invoice sending
const emailService = require('../services/emailService');
const { sendInvoiceEmail } = require('../services/invoice-email.service');

// S3 service for file uploads
let s3Service = null;
try {
    s3Service = require('../services/s3.service');
} catch (e) {
    logger.info('S3 service not available - file uploads will use local storage');
}

// Multer for file uploads (if available)
let multer = null;
let upload = null;
try {
    multer = require('multer');
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Configure multer storage
    // Use memory storage for S3 uploads, disk storage as fallback
    const storage = process.env.AWS_ACCESS_KEY_ID 
        ? multer.memoryStorage() // Store in memory for S3 uploads
        : multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, uploadsDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, `logo-${req.organizationId}-${uniqueSuffix}${ext}`);
            }
        });
    
    // File filter for images only
    const fileFilter = (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
        }
    };
    
    upload = multer({
        storage: storage,
        limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
        fileFilter: fileFilter
    });
} catch (e) {
    logger.info('Multer not available - file upload disabled');
}

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
    router.get('/products', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { is_active, search } = req.query;

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

            const result = await withDbClient(pool, async (client) => {
                return client.query(query, params);
            });

            return sendSuccess(res, result.rows);
    }));

    /**
     * POST /api/invoices/products - Create product
     */
    router.post('/products', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable } = req.body;

            if (!name || price === undefined) {
                return sendBadRequest(res, 'Name and price are required');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
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
            });

            return sendCreated(res, result.rows[0]);
    }));

    /**
     * PUT /api/invoices/products/:id - Update product
     */
    router.put('/products/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { id } = req.params;
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable, is_active } = req.body;

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
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
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Product');
            }

            return sendSuccess(res, result.rows[0]);
    }));

    /**
     * DELETE /api/invoices/products/:id - Delete product
     */
    router.delete('/products/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM products WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Product');
            }

            return sendSuccess(res, { success: true });
    }));

    // ======================
    // Invoice Email Preview
    // ======================

    /**
     * POST /api/invoices/email/preview - Generate invoice email preview
     * Returns the HTML that would be sent, wrapped in branded template
     */
    router.post('/email/preview', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { message, subject, includePaymentLink } = req.body;

            if (!message || !message.trim()) {
                return sendBadRequest(res, 'Message content is required');
            }

            // Import the branded template wrapper
            const { wrapInBrandedTemplate } = require('../services/email-template.service');

            // Build the payment link section if requested
            const paymentLinkSection = includePaymentLink ? `
                <div style="text-align: center; margin: 24px 0;">
                    <a href="#" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                        Pay Now
                    </a>
                </div>
            ` : '';

            // Build the invoice email body content (matching sendInvoiceEmail logic)
            const emailBodyContent = `
                <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">${message.trim()}</div>
                ${paymentLinkSection}
            `;

            // Wrap in branded template with isPreview: true for correct logo URL
            const previewHtml = wrapInBrandedTemplate(emailBodyContent, {
                subject: subject || 'Invoice',
                isPreview: true,
                showUnsubscribe: false // Transactional emails don't need unsubscribe
            });

            return sendSuccess(res, {
                html: previewHtml
            });
    }));

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
                    SELECT i.*, c.first_name as contact_first_name, c.last_name as contact_last_name
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

            const client = await pool.connect();

            const invoiceResult = await client.query(`
                SELECT i.*, 
                    c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email,
                    b.name as business_name, b.email as business_email, b.phone as business_phone,
                    b.address as business_address, b.tax_id as business_tax_id, b.logo_url as business_logo_url
                FROM invoices i
                LEFT JOIN contacts c ON i.contact_id = c.id
                LEFT JOIN businesses b ON i.business_id = b.id
                WHERE i.id = $1 AND i.organization_id = $2
            `, [parseInt(id), req.organizationId]);

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
            
            // Include business object if business_id is set
            if (invoice.business_id) {
                invoice.business = {
                    id: invoice.business_id,
                    name: invoice.business_name,
                    email: invoice.business_email,
                    phone: invoice.business_phone,
                    address: invoice.business_address,
                    tax_id: invoice.business_tax_id,
                    logo_url: invoice.business_logo_url
                };
            }

            res.json(invoice);
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
                return res.status(400).json({ error: 'At least one line item is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Get next invoice number
                const invoiceNumber = await getNextInvoiceNumber(client, req.organizationId);

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
                    RETURNING *
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

            const client = await pool.connect();

            // Check invoice exists
            const checkResult = await client.query(
                'SELECT id, invoice_number FROM invoices WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            // Delete invoice items first (foreign key constraint)
            await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
            
            // Delete the invoice
            await client.query('DELETE FROM invoices WHERE id = $1', [id]);
            client.release();

            res.json({ success: true, invoice_number: checkResult.rows[0].invoice_number });
        } catch (error) {
            console.error('Error deleting invoice:', error);
            return sendError(res, 'Failed to delete invoice');
        }
    }));

    // ======================
    // Invoice Actions
    // ======================

    /**
     * POST /api/invoices/:id/send - Send invoice to customer
     * Accepts optional email customization: { subject, message, ccEmails, resend }
     * Set resend: true to resend an already-sent invoice without changing status
     */
    router.post('/:id/send', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const { subject, message, ccEmails, includePaymentLink, resend } = req.body || {};
            logger.info(`Send invoice ${id} - Request body:`, { subject: !!subject, message: !!message, ccEmails: ccEmails?.length || 0, includePaymentLink, resend });

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const client = await pool.connect();

            try {
                // Fetch the full invoice data with items
                const invoiceResult = await client.query(`
                    SELECT i.*, 
                           b.name as business_name, b.email as business_email, 
                           b.phone as business_phone, b.address as business_address,
                           b.logo_url as business_logo_url, b.tax_id as business_tax_id
                    FROM invoices i
                    LEFT JOIN businesses b ON i.business_id = b.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [id, req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    client.release();
                    return res.status(404).json({ error: 'Invoice not found' });
                }

                const invoice = invoiceResult.rows[0];

                // Check if invoice can be sent (allow resend for sent invoices)
                const allowedStatuses = resend ? ['draft', 'sent', 'viewed', 'partial', 'overdue'] : ['draft', 'sent'];
                if (!allowedStatuses.includes(invoice.status)) {
                    client.release();
                    return res.status(400).json({ error: 'Invoice cannot be sent in current status' });
                }

                // Check if customer email exists
                if (!invoice.customer_email) {
                    client.release();
                    return res.status(400).json({ error: 'Customer email is required to send invoice' });
                }

                // Fetch invoice items for PDF generation
                const itemsResult = await client.query(`
                    SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
                `, [id]);
                invoice.items = itemsResult.rows;

                // Add business info to invoice object for PDF
                invoice.business = {
                    name: invoice.business_name,
                    email: invoice.business_email,
                    phone: invoice.business_phone,
                    address: invoice.business_address,
                    logo_url: invoice.business_logo_url,
                    tax_id: invoice.business_tax_id
                };

                // Fetch payment settings for business info (fallback)
                const settingsResult = await client.query(`
                    SELECT * FROM payment_settings WHERE organization_id = $1
                `, [req.organizationId]);

                const settings = settingsResult.rows[0] || {};

                // Use business info from invoice or fall back to settings
                if (!invoice.business.name) {
                    invoice.business.name = settings.business_name;
                    invoice.business.email = settings.business_email;
                    invoice.business.phone = settings.business_phone;
                    invoice.business.address = settings.business_address;
                    invoice.business.logo_url = settings.logo_url;
                    invoice.business.tax_id = settings.tax_id;
                }
                
                // Fallback to settings logo_url if business doesn't have one
                if (!invoice.business.logo_url && settings.logo_url) {
                    invoice.business.logo_url = settings.logo_url;
                }
                
                // Log logo URL for debugging
                logger.info(`Invoice ${invoice.invoice_number} - Business logo_url: ${invoice.business.logo_url || 'none'}, Settings logo_url: ${settings.logo_url || 'none'}`);

                // Update invoice status to 'sent' only if not already sent (or if resend=false)
                let updatedInvoice = invoice;
                if (invoice.status === 'draft') {
                    const updateResult = await client.query(`
                        UPDATE invoices SET
                            status = 'sent',
                            sent_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1 AND organization_id = $2
                        RETURNING *
                    `, [id, req.organizationId]);
                    updatedInvoice = updateResult.rows[0];
                }

                // Generate PDF for attachment
                let pdfBuffer = null;
                try {
                    const { generateInvoicePDF, isPDFAvailable } = require('../services/pdf.service');
                    if (isPDFAvailable()) {
                        pdfBuffer = await generateInvoicePDF(invoice, settings);
                        logger.info(`Generated PDF for invoice ${invoice.invoice_number}, size: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
                        logger.info(`PDF buffer type: ${pdfBuffer ? pdfBuffer.constructor.name : 'null'}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}`);
                    } else {
                        logger.warn('PDF generation not available (puppeteer not installed) - sending email without attachment');
                    }
                } catch (pdfErr) {
                    logger.error('Error generating invoice PDF:', pdfErr);
                    logger.error('PDF error details:', pdfErr.stack);
                    // Continue without PDF attachment
                }

                // Handle payment link if requested
                let paymentUrl = null;
                logger.info(`Payment link check - includePaymentLink: ${includePaymentLink}, amount_due: ${invoice.amount_due}, stripe: ${!!stripe}`);
                if (includePaymentLink && invoice.amount_due > 0 && stripe) {
                    try {
                        // Check if we have an existing Stripe session
                        if (invoice.stripe_payment_intent_id) {
                            try {
                                // Retrieve existing session
                                const session = await stripe.checkout.sessions.retrieve(
                                    invoice.stripe_payment_intent_id
                                );
                                
                                // Only reuse if session is not expired (sessions expire after 24 hours)
                                if (session.status === 'open' && session.url) {
                                    paymentUrl = session.url;
                                    logger.info(`Reusing existing payment link for invoice ${invoice.id}`);
                                }
                            } catch (retrieveError) {
                                logger.warn(`Could not retrieve existing session: ${retrieveError.message}`);
                            }
                        }
                        
                        // Create new session if no valid existing one
                        if (!paymentUrl) {
                            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                            const session = await stripe.checkout.sessions.create({
                                mode: 'payment',
                                payment_method_types: ['card'],
                                line_items: [{
                                    price_data: {
                                        currency: (invoice.currency || 'USD').toLowerCase(),
                                        product_data: {
                                            name: `Invoice ${invoice.invoice_number}`,
                                            description: invoice.customer_name || 'Invoice Payment'
                                        },
                                        unit_amount: Math.round(invoice.amount_due * 100)
                                    },
                                    quantity: 1
                                }],
                                success_url: `${frontendUrl}/invoices?payment=success&invoice=${id}`,
                                cancel_url: `${frontendUrl}/invoices?payment=cancelled&invoice=${id}`,
                                customer_email: invoice.customer_email || undefined,
                                metadata: {
                                    invoice_id: invoice.id.toString(),
                                    invoice_number: invoice.invoice_number,
                                    organization_id: req.organizationId.toString()
                                }
                            });
                            
                            // Store session ID
                            await client.query(
                                'UPDATE invoices SET stripe_payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                                [session.id, id]
                            );
                            
                            paymentUrl = session.url;
                            logger.info(`Created new payment link for invoice ${invoice.id}`);
                        }
                    } catch (paymentLinkError) {
                        logger.error('Error generating payment link:', paymentLinkError);
                        // Continue without payment link - don't fail the send operation
                    }
                }

                // Attempt to send email
                let emailSent = false;
                let emailError = null;

                if (emailService.isEnabled()) {
                    try {
                        // Send using the invoice email service with PDF attachment
                        emailSent = await sendInvoiceEmail(
                            emailService, 
                            invoice, 
                            { ...settings, business_name: invoice.business.name || settings.business_name, business_email: invoice.business.email || settings.business_email },
                            paymentUrl, // Now dynamically set based on includePaymentLink flag
                            pdfBuffer,
                            {
                                cc: ccEmails,
                                customSubject: subject,
                                customMessage: message
                            }
                        );

                        if (emailSent) {
                            logger.info(`Invoice ${invoice.invoice_number} email sent to ${invoice.customer_email}${pdfBuffer ? ' with PDF' : ''}`);
                        } else {
                            emailError = 'Email service returned false';
                            logger.warn(`Failed to send invoice ${invoice.invoice_number} email`);
                        }
                    } catch (emailErr) {
                        logger.error('Error sending invoice email:', emailErr);
                        emailError = emailErr.message;
                    }
                } else {
                    logger.warn('Email service not configured - invoice marked as sent but no email delivered');
                    emailError = 'Email service not configured';
                }

                client.release();

                // Return response with email status
                res.json({
                    ...updatedInvoice,
                    emailSent,
                    emailError: emailError || undefined,
                });
            } catch (innerError) {
                client.release();
                throw innerError;
            }
        } catch (error) {
            logger.error('Error sending invoice:', error);
            return sendError(res, 'Failed to send invoice');
        }
    }));

    /**
     * GET /api/invoices/:id/pdf - Generate and download invoice PDF
     */
    router.get('/:id/pdf', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const { generateInvoicePDF, isPDFAvailable } = require('../services/pdf.service');

            if (!isPDFAvailable()) {
                return res.status(503).json({ error: 'PDF generation not available' });
            }

            const client = await pool.connect();

            // Get invoice with items
            const invoiceResult = await client.query(`
                SELECT i.*, c.first_name as contact_first_name, c.last_name as contact_last_name
                FROM invoices i
                LEFT JOIN contacts c ON i.contact_id = c.id
                WHERE i.id = $1 AND i.organization_id = $2
            `, [id, req.organizationId]);

            if (invoiceResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const invoice = invoiceResult.rows[0];

            // Get items
            const itemsResult = await client.query(`
                SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
            `, [id]);
            invoice.items = itemsResult.rows;

            // Get payment settings for business info
            const settingsResult = await client.query(
                'SELECT * FROM payment_settings WHERE organization_id = $1',
                [req.organizationId]
            );
            const settings = settingsResult.rows[0] || {};

            client.release();

            // Generate PDF
            const pdf = await generateInvoicePDF(invoice, settings);

            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
            res.setHeader('Content-Length', pdf.length);

            res.send(pdf);
        } catch (error) {
            console.error('Error generating PDF:', error);
            return sendError(res, 'Failed to generate PDF');
        }
    }));

    /**
     * POST /api/invoices/:id/record-payment - Record manual payment
     */
    router.post('/:id/record-payment', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

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

                // Prepare values ensuring correct JavaScript types
                const orgId = parseInt(req.organizationId);
                const invId = parseInt(id);
                const contId = invoice.contact_id != null ? parseInt(invoice.contact_id) : null;
                const payAmount = parseFloat(amount);
                const payCurrency = invoice.currency || 'USD';
                const payMethod = payment_method || 'other';
                const payNotes = notes || null;

                // Create payment record - simple parameterized query (NULL values handled by PostgreSQL)
                const paymentResult = await client.query(`
                    INSERT INTO payments (
                        organization_id, invoice_id, contact_id, amount, currency,
                        payment_method, status, notes, paid_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, CURRENT_TIMESTAMP)
                    RETURNING *
                `, [
                    orgId,
                    invId,
                    contId,
                    payAmount,
                    payCurrency,
                    payMethod,
                    payNotes
                ]);

                // Update invoice
                const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
                const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
                const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                await client.query(`
                    UPDATE invoices SET
                        amount_paid = $1,
                        amount_due = $2,
                        status = $3::VARCHAR(20),
                        paid_at = CASE WHEN $3::VARCHAR(20) = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
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
            return sendError(res, 'Failed to record payment');
        }
    }));

    /**
     * POST /api/invoices/:id/create-payment-link - Create Stripe Checkout Session
     * Returns a URL to redirect the customer to Stripe's hosted checkout page
     */
    router.post('/:id/create-payment-link', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            if (!stripe) {
                return res.status(400).json({ error: 'Stripe not configured' });
            }
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

            // Get frontend URL for redirects
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

            // Create Stripe Checkout Session (hosted payment page)
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: (invoice.currency || 'USD').toLowerCase(),
                        product_data: {
                            name: `Invoice ${invoice.invoice_number}`,
                            description: invoice.customer_name || 'Invoice Payment'
                        },
                        unit_amount: Math.round(invoice.amount_due * 100) // Convert to cents
                    },
                    quantity: 1
                }],
                success_url: `${frontendUrl}/invoices?payment=success&invoice=${id}`,
                cancel_url: `${frontendUrl}/invoices?payment=cancelled&invoice=${id}`,
                customer_email: invoice.customer_email || undefined,
                metadata: {
                    invoice_id: invoice.id.toString(),
                    invoice_number: invoice.invoice_number,
                    organization_id: req.organizationId.toString()
                }
            });

            // Store checkout session ID for reference
            await client.query(`
                UPDATE invoices SET
                    stripe_payment_intent_id = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [session.id, id]);

            client.release();

            // Return the checkout URL for redirect
            res.json({
                url: session.url,
                session_id: session.id
            });
        } catch (error) {
            console.error('Error creating payment link:', error);
            return sendError(res, 'Failed to create payment link');
        }
    }));

    // ======================
    // Payments History
    // ======================

    /**
     * GET /api/invoices/payments - List all payments
     */
    router.get('/payments', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { status, payment_method, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE p.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND p.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (payment_method && payment_method !== 'all') {
                whereClause += ` AND p.payment_method = $${paramIndex}`;
                params.push(payment_method);
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM payments p ${whereClause}`,
                params
            );

            const result = await client.query(`
                SELECT p.*, 
                    i.invoice_number,
                    c.first_name as contact_first_name, 
                    c.last_name as contact_last_name,
                    COALESCE(c.first_name || ' ' || c.last_name, i.customer_name) as contact_name
                FROM payments p
                LEFT JOIN invoices i ON p.invoice_id = i.id
                LEFT JOIN contacts c ON p.contact_id = c.id
                ${whereClause}
                ORDER BY p.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                payments: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching payments:', error);
            return sendError(res, 'Failed to fetch payments');
        }
    }));

    // ======================
    // Businesses (Multi-Business Support)
    // ======================

    /**
     * GET /api/invoices/businesses - List all businesses for organization
     */
    router.get('/businesses', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const client = await pool.connect();

            const result = await client.query(
                `SELECT * FROM businesses 
                 WHERE organization_id = $1 AND is_active = true
                 ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
                [req.organizationId]
            );

            client.release();
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching businesses:', error);
            return sendError(res, 'Failed to fetch businesses');
        }
    }));

    /**
     * GET /api/invoices/businesses/:id - Get single business
     */
    router.get('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const client = await pool.connect();

            const result = await client.query(
                'SELECT * FROM businesses WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Business not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching business:', error);
            return sendError(res, 'Failed to fetch business');
        }
    }));

    /**
     * POST /api/invoices/businesses - Create new business
     */
    router.post('/businesses', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { name, email, phone, address, tax_id, logo_url } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Business name is required' });
            }

            const client = await pool.connect();

            const result = await client.query(`
                INSERT INTO businesses (organization_id, name, email, phone, address, tax_id, logo_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [
                req.organizationId,
                name.trim(),
                email || null,
                phone || null,
                address || null,
                tax_id || null,
                logo_url || null
            ]);

            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating business:', error);
            return sendError(res, 'Failed to create business');
        }
    }));

    /**
     * PUT /api/invoices/businesses/:id - Update business
     */
    router.put('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const { name, email, phone, address, tax_id, logo_url, is_active } = req.body;

            if (name !== undefined && (!name || !name.trim())) {
                return res.status(400).json({ error: 'Business name cannot be empty' });
            }

            const client = await pool.connect();

            // Check if business exists and belongs to organization
            const checkResult = await client.query(
                'SELECT id FROM businesses WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Business not found' });
            }

            const result = await client.query(`
                UPDATE businesses SET
                    name = COALESCE($1, name),
                    email = COALESCE($2, email),
                    phone = COALESCE($3, phone),
                    address = COALESCE($4, address),
                    tax_id = COALESCE($5, tax_id),
                    logo_url = COALESCE($6, logo_url),
                    is_active = COALESCE($7, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $8 AND organization_id = $9
                RETURNING *
            `, [
                name?.trim(),
                email,
                phone,
                address,
                tax_id,
                logo_url,
                is_active,
                id,
                req.organizationId
            ]);

            client.release();
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating business:', error);
            return sendError(res, 'Failed to update business');
        }
    }));

    /**
     * DELETE /api/invoices/businesses/:id - Delete (soft) business
     */
    router.delete('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const client = await pool.connect();

            // Check if business exists and belongs to organization
            const checkResult = await client.query(
                'SELECT id FROM businesses WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Business not found' });
            }

            // Soft delete by setting is_active = false
            await client.query(
                'UPDATE businesses SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            client.release();
            res.json({ success: true, message: 'Business deleted' });
        } catch (error) {
            console.error('Error deleting business:', error);
            return sendError(res, 'Failed to delete business');
        }
    }));

    /**
     * POST /api/invoices/businesses/:id/logo - Upload business logo
     */
    router.post('/businesses/:id/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        if (!upload) {
            return res.status(503).json({ error: 'File upload not available' });
        }

        const { id } = req.params;
        if (isNaN(parseInt(id))) {
            return next();
        }

        upload.single('logo')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
                    }
                }
                return res.status(400).json({ error: err.message });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            try {
                const client = await pool.connect();

                // Check if business exists
                const checkResult = await client.query(
                    'SELECT logo_url FROM businesses WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    client.release();
                    return res.status(404).json({ error: 'Business not found' });
                }

                // Delete old logo file if exists
                if (checkResult.rows[0].logo_url) {
                    const oldUrl = checkResult.rows[0].logo_url;
                    // Delete from S3 if it's an S3 URL
                    if (s3Service && oldUrl.includes('.s3.')) {
                        try {
                            const oldKey = oldUrl.split('.amazonaws.com/')[1];
                            if (oldKey) {
                                await s3Service.deleteFile(oldKey);
                            }
                        } catch (s3Err) {
                            logger.warn('Failed to delete old logo from S3:', s3Err);
                        }
                    }
                    // Delete local file if it exists
                    if (oldUrl.includes('/uploads/logos/')) {
                        const oldFilename = oldUrl.split('/uploads/logos/')[1];
                        const oldFilePath = path.join(__dirname, '../../uploads/logos', oldFilename);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }
                }

                // Upload to S3 or use local storage
                let logoUrl;
                if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                    // Upload to S3
                    const key = `logos/logo-${req.organizationId}-${id}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
                    logoUrl = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
                    // Delete local file after S3 upload
                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                    }
                } else {
                    // Fallback to local storage
                    logoUrl = `/uploads/logos/${req.file.filename}`;
                }

                // Update business with logo URL
                await client.query(
                    'UPDATE businesses SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [logoUrl, id]
                );

                client.release();
                res.json({ logo_url: logoUrl });
            } catch (error) {
                console.error('Error uploading business logo:', error);
                return sendError(res, 'Failed to upload logo');
            }
        });
    }));

    /**
     * DELETE /api/invoices/businesses/:id/logo - Remove business logo
     */
    router.delete('/businesses/:id/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;
            if (isNaN(parseInt(id))) {
                return next();
            }

            const client = await pool.connect();

            // Get current logo
            const result = await client.query(
                'SELECT logo_url FROM businesses WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (result.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Business not found' });
            }

            if (result.rows[0].logo_url) {
                const oldUrl = result.rows[0].logo_url;
                // Delete from S3 if it's an S3 URL
                if (s3Service && oldUrl.includes('.s3.')) {
                    try {
                        const oldKey = oldUrl.split('.amazonaws.com/')[1];
                        if (oldKey) {
                            await s3Service.deleteFile(oldKey);
                        }
                    } catch (s3Err) {
                        logger.warn('Failed to delete old logo from S3:', s3Err);
                    }
                }
                // Delete local file if it exists
                if (oldUrl.includes('/uploads/logos/')) {
                    const oldFilename = oldUrl.split('/uploads/logos/')[1];
                    const oldFilePath = path.join(__dirname, '../../uploads/logos', oldFilename);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                }
            }

            // Clear logo_url
            await client.query(
                'UPDATE businesses SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            client.release();
            res.json({ success: true });
        } catch (error) {
            console.error('Error removing business logo:', error);
            return sendError(res, 'Failed to remove logo');
        }
    }));

    // ======================
    // Payment Settings
    // ======================

    /**
     * GET /api/invoices/settings - Get payment settings
     */
    router.get('/settings', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
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
                    default_tax_rate: 10,
                    default_currency: 'USD',
                    stripe_connected: false
                });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching payment settings:', error);
            return sendError(res, 'Failed to fetch payment settings');
        }
    }));

    /**
     * PUT /api/invoices/settings - Update payment settings
     */
    router.put('/settings', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
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
                default_tax_rate ?? 10,
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
            return sendError(res, 'Failed to update payment settings');
        }
    }));

    /**
     * POST /api/invoices/settings/logo - Upload business logo
     */
    router.post('/settings/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        if (!upload) {
            return res.status(503).json({ error: 'File upload not available. Please install multer: npm install multer' });
        }

        // Use multer middleware
        upload.single('logo')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
                    }
                }
                return res.status(400).json({ error: err.message });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            try {
                const client = await pool.connect();

                // Delete old logo file if exists
                const oldSettings = await client.query(
                    'SELECT logo_url FROM payment_settings WHERE organization_id = $1',
                    [req.organizationId]
                );

                if (oldSettings.rows.length > 0 && oldSettings.rows[0].logo_url) {
                    const oldUrl = oldSettings.rows[0].logo_url;
                    // Delete from S3 if it's an S3 URL
                    if (s3Service && oldUrl.includes('.s3.')) {
                        try {
                            const oldKey = oldUrl.split('.amazonaws.com/')[1];
                            if (oldKey) {
                                await s3Service.deleteFile(oldKey);
                            }
                        } catch (s3Err) {
                            logger.warn('Failed to delete old logo from S3:', s3Err);
                        }
                    }
                    // Delete local file if it exists
                    if (oldUrl.includes('/uploads/logos/')) {
                        const filename = oldUrl.split('/uploads/logos/')[1];
                        const oldFilePath = path.join(__dirname, '../../uploads/logos', filename);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }
                }

                // Upload to S3 or use local storage
                let logoUrl;
                if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                    // Upload to S3
                    const key = `logos/logo-${req.organizationId}-settings-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
                    logoUrl = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
                    // Delete local file after S3 upload
                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                    }
                } else {
                    // Fallback to local storage
                    logoUrl = `/uploads/logos/${req.file.filename}`;
                }

                await client.query(`
                    INSERT INTO payment_settings (organization_id, logo_url)
                    VALUES ($1, $2)
                    ON CONFLICT (organization_id) DO UPDATE SET
                        logo_url = EXCLUDED.logo_url,
                        updated_at = CURRENT_TIMESTAMP
                `, [req.organizationId, logoUrl]);

                client.release();

                res.json({
                    success: true,
                    logo_url: logoUrl
                });
            } catch (error) {
                // Clean up uploaded file on error
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                console.error('Error uploading logo:', error);
                return sendError(res, 'Failed to upload logo');
            }
        });
    }));

    /**
     * DELETE /api/invoices/settings/logo - Remove business logo
     */
    router.delete('/settings/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const client = await pool.connect();

            // Get current logo
            const result = await client.query(
                'SELECT logo_url FROM payment_settings WHERE organization_id = $1',
                [req.organizationId]
            );

            if (result.rows.length > 0 && result.rows[0].logo_url) {
                const oldUrl = result.rows[0].logo_url;
                // Delete from S3 if it's an S3 URL
                if (s3Service && oldUrl.includes('.s3.')) {
                    try {
                        const oldKey = oldUrl.split('.amazonaws.com/')[1];
                        if (oldKey) {
                            await s3Service.deleteFile(oldKey);
                        }
                    } catch (s3Err) {
                        logger.warn('Failed to delete old logo from S3:', s3Err);
                    }
                }
                // Delete local file if it exists
                if (oldUrl.includes('/uploads/logos/')) {
                    const filename = oldUrl.split('/uploads/logos/')[1];
                    const filePath = path.join(__dirname, '../../uploads/logos', filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            }

            // Clear logo_url in settings
            await client.query(`
                UPDATE payment_settings 
                SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = $1
            `, [req.organizationId]);

            client.release();
            res.json({ success: true });
        } catch (error) {
            console.error('Error removing logo:', error);
            return sendError(res, 'Failed to remove logo');
        }
    }));

    // ======================
    // Stripe Webhooks
    // ======================

    /**
     * POST /api/invoices/webhook/stripe - Stripe webhook handler
     */
    router.post('/webhook/stripe', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
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
            logger.info(`Processing Stripe webhook event: ${event.type}`);

            switch (event.type) {
                // Checkout Session completed - customer finished the hosted checkout
                case 'checkout.session.completed':
                    const session = event.data.object;
                    const invoiceId = session.metadata?.invoice_id;

                    logger.info(`Checkout session completed for invoice ${invoiceId}`, {
                        sessionId: session.id,
                        paymentStatus: session.payment_status,
                        amountTotal: session.amount_total
                    });

                    // Only process if payment was successful
                    if (invoiceId && session.payment_status === 'paid') {
                        // Record payment
                        await client.query(`
                            INSERT INTO payments (
                                organization_id, invoice_id, amount, currency, payment_method, status,
                                stripe_payment_intent_id, paid_at
                            ) VALUES (
                                $1, $2, $3, $4, 'stripe', 'succeeded', $5, CURRENT_TIMESTAMP
                            )
                        `, [
                            session.metadata.organization_id,
                            invoiceId,
                            session.amount_total / 100,
                            (session.currency || 'usd').toUpperCase(),
                            session.payment_intent || session.id
                        ]);

                        // Update invoice
                        const invoiceResult = await client.query(
                            'SELECT total, amount_paid FROM invoices WHERE id = $1',
                            [invoiceId]
                        );

                        if (invoiceResult.rows.length > 0) {
                            const invoice = invoiceResult.rows[0];
                            const newAmountPaid = parseFloat(invoice.amount_paid) + (session.amount_total / 100);
                            const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
                            const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                            await client.query(`
                                UPDATE invoices SET
                                    amount_paid = $1,
                                    amount_due = $2,
                                    status = $3::VARCHAR(20),
                                    paid_at = CASE WHEN $3::VARCHAR(20) = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = $4
                            `, [newAmountPaid, Math.max(0, newAmountDue), newStatus, invoiceId]);

                            logger.info(`Invoice ${invoiceId} updated: status=${newStatus}, amountPaid=${newAmountPaid}`);
                        }
                    }
                    break;

                // Checkout session expired - customer abandoned checkout (optional handling)
                case 'checkout.session.expired':
                    const expiredSession = event.data.object;
                    logger.info(`Checkout session expired`, {
                        sessionId: expiredSession.id,
                        invoiceId: expiredSession.metadata?.invoice_id
                    });
                    // No action needed - invoice remains unpaid
                    break;

                default:
                    logger.debug(`Unhandled Stripe event type: ${event.type}`);
            }

            client.release();
            res.json({ received: true });
        } catch (error) {
            client.release();
            console.error('Error processing Stripe webhook:', error);
            return sendError(res, 'Webhook processing failed');
        }
    }));

    return router;
};
