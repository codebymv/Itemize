const express = require('express');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const emailService = require('../../services/emailService');
const { sendInvoiceEmail } = require('../../services/invoice-email.service');
const { INVOICE_COLUMNS, INVOICE_ITEM_COLUMNS, PAYMENT_COLUMNS, PAYMENT_SETTINGS_COLUMNS, selectColumns } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization, stripe }) => {
    const router = express.Router();

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
                return sendNotFound(res, 'Invoice');
            }

            const sendResult = await withDbClient(pool, async (client) => {
                // Fetch the full invoice data with items
                const invoiceResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS, 'i')}, 
                           b.name as business_name, b.email as business_email, 
                           b.phone as business_phone, b.address as business_address,
                           b.logo_url as business_logo_url, b.tax_id as business_tax_id
                    FROM invoices i
                    LEFT JOIN businesses b ON i.business_id = b.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [id, req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    return { errorStatus: 404, error: 'Invoice not found' };
                }

                const invoice = invoiceResult.rows[0];

                // Check if invoice can be sent (allow resend for sent invoices)
                const allowedStatuses = resend ? ['draft', 'sent', 'viewed', 'partial', 'overdue'] : ['draft', 'sent'];
                if (!allowedStatuses.includes(invoice.status)) {
                    return { errorStatus: 400, error: 'Invoice cannot be sent in current status' };
                }

                // Check if customer email exists
                if (!invoice.customer_email) {
                    return { errorStatus: 400, error: 'Customer email is required to send invoice' };
                }

                // Fetch invoice items for PDF generation
                const itemsResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_ITEM_COLUMNS)} FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
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
                    SELECT ${selectColumns(PAYMENT_SETTINGS_COLUMNS)} FROM payment_settings WHERE organization_id = $1
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
                        RETURNING ${selectColumns(INVOICE_COLUMNS)}
                    `, [id, req.organizationId]);
                    updatedInvoice = updateResult.rows[0];
                }

                // Generate PDF for attachment
                let pdfBuffer = null;
                try {
                    const { generateInvoicePDF, isPDFAvailable } = require('../../services/pdf.service');
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

                return {
                    data: {
                        ...updatedInvoice,
                        emailSent,
                        emailError: emailError || undefined
                    }
                };
            });

            if (sendResult.errorStatus) {
                return sendError(res, sendResult.error, sendResult.errorStatus);
            }

            sendSuccess(res, sendResult.data);
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
                return sendNotFound(res, 'Invoice');
            }

            const { generateInvoicePDF, isPDFAvailable } = require('../../services/pdf.service');

            if (!isPDFAvailable()) {
                return sendError(res, 'PDF generation not available', 503, 'SERVICE_UNAVAILABLE');
            }

            const pdfData = await withDbClient(pool, async (client) => {
                // Get invoice with items
                const invoiceResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS, 'i')}, c.first_name as contact_first_name, c.last_name as contact_last_name
                    FROM invoices i
                    LEFT JOIN contacts c ON i.contact_id = c.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [id, req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    return { notFound: true };
                }

                const invoice = invoiceResult.rows[0];

                // Get items
                const itemsResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_ITEM_COLUMNS)} FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order
                `, [id]);
                invoice.items = itemsResult.rows;

                // Get payment settings for business info
                const settingsResult = await client.query(
                    `SELECT ${selectColumns(PAYMENT_SETTINGS_COLUMNS)} FROM payment_settings WHERE organization_id = $1`,
                    [req.organizationId]
                );
                const settings = settingsResult.rows[0] || {};

                return { invoice, settings };
            });

            if (pdfData.notFound) {
                return sendNotFound(res, 'Invoice');
            }

            // Generate PDF
            const pdf = await generateInvoicePDF(pdfData.invoice, pdfData.settings);

            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${pdfData.invoice.invoice_number}.pdf"`);
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
                return sendNotFound(res, 'Invoice');
            }

            const { amount, payment_method, notes } = req.body;

            if (!amount || amount <= 0) {
                return sendBadRequest(res, 'Valid amount is required');
            }

            const paymentResult = await withTransaction(pool, async (client) => {
                // Get invoice
                const invoiceResult = await client.query(
                    `SELECT ${selectColumns(INVOICE_COLUMNS)} FROM invoices WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (invoiceResult.rows.length === 0) {
                    return { notFound: true };
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
                const paymentInsert = await client.query(`
                    INSERT INTO payments (
                        organization_id, invoice_id, contact_id, amount, currency,
                        payment_method, status, notes, paid_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, CURRENT_TIMESTAMP)
                    RETURNING ${selectColumns(PAYMENT_COLUMNS)}
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

                return {
                    payment: paymentInsert.rows[0],
                    invoice: {
                        amount_paid: newAmountPaid,
                        amount_due: Math.max(0, newAmountDue),
                        status: newStatus
                    }
                };
            });

            if (paymentResult.notFound) {
                return sendNotFound(res, 'Invoice');
            }

            sendSuccess(res, paymentResult);
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
                return sendNotFound(res, 'Invoice');
            }

            if (!stripe) {
                return sendBadRequest(res, 'Stripe not configured');
            }

            const paymentLinkResult = await withDbClient(pool, async (client) => {
                const invoiceResult = await client.query(
                    `SELECT ${selectColumns(INVOICE_COLUMNS)} FROM invoices WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (invoiceResult.rows.length === 0) {
                    return { errorStatus: 404, error: 'Invoice not found' };
                }

                const invoice = invoiceResult.rows[0];

                if (invoice.amount_due <= 0) {
                    return { errorStatus: 400, error: 'Invoice already paid' };
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

                return {
                    url: session.url,
                    session_id: session.id
                };
            });

            if (paymentLinkResult.errorStatus) {
                return sendError(res, paymentLinkResult.error, paymentLinkResult.errorStatus);
            }

            // Return the checkout URL for redirect
            sendSuccess(res, paymentLinkResult);
        } catch (error) {
            console.error('Error creating payment link:', error);
            return sendError(res, 'Failed to create payment link');
        }
    }));

    return router;
};
