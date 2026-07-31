/**
 * Retained estimate action routes.
 *
 * Estimate CRUD is permanently GraphQL-owned. These two action boundaries
 * remain temporarily available for independent send and conversion cutover.
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { withDbClient, withTransaction } = require('../utils/db');
const {
    sendSuccess,
    sendBadRequest,
    sendNotFound,
    sendError,
} = require('../utils/response');
const emailService = require('../services/emailService');
const { sendEstimateEmail } = require('../services/invoice-email.service');
const { allocateInvoiceNumber } = require('../services/invoice-number.service');
const {
    INVOICE_ITEM_UNNEST_COLUMNS,
    estimateColumns,
    estimateItemColumns,
    invoiceColumns,
    paymentSettingsColumns,
} = require('./estimates.columns');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.post('/:id/send', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const estimateResult = await client.query(`
                    SELECT ${estimateColumns('e')},
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
                if (!['draft', 'sent'].includes(estimate.status)) {
                    return {
                        errorStatus: 400,
                        error: 'Estimate cannot be sent in current status',
                    };
                }
                if (!estimate.customer_email) {
                    return {
                        errorStatus: 400,
                        error: 'Customer email is required to send estimate',
                    };
                }

                const itemsResult = await client.query(`
                    SELECT ${estimateItemColumns()} FROM estimate_items
                    WHERE estimate_id = $1
                    ORDER BY sort_order
                `, [id]);
                estimate.items = itemsResult.rows;

                const settingsResult = await client.query(`
                    SELECT ${paymentSettingsColumns()} FROM payment_settings
                    WHERE organization_id = $1
                `, [req.organizationId]);
                const settings = settingsResult.rows[0] || {};

                estimate.business = {
                    name: estimate.business_name,
                    email: estimate.business_email,
                    phone: estimate.business_phone,
                    address: estimate.business_address,
                    logo_url: estimate.business_logo_url,
                    tax_id: estimate.business_tax_id,
                };
                if (!estimate.business.name) {
                    estimate.business.name = settings.business_name;
                    estimate.business.email = settings.business_email;
                    estimate.business.phone = settings.business_phone;
                    estimate.business.address = settings.business_address;
                    estimate.business.logo_url = settings.logo_url;
                    estimate.business.tax_id = settings.tax_id;
                }
                if (!estimate.business.logo_url && settings.logo_url) {
                    estimate.business.logo_url = settings.logo_url;
                }

                logger.info(
                    `Estimate ${estimate.estimate_number} - Business logo_url: `
                    + `${estimate.business.logo_url || 'none'}, Settings logo_url: `
                    + `${settings.logo_url || 'none'}`,
                );

                let pdfBuffer = null;
                try {
                    const {
                        generateEstimatePDF,
                        isEstimatePDFAvailable,
                    } = require('../services/pdf.service');
                    if (isEstimatePDFAvailable()) {
                        pdfBuffer = await generateEstimatePDF(estimate);
                        logger.info(
                            `Generated PDF for estimate ${estimate.estimate_number}, `
                            + `size: ${pdfBuffer ? pdfBuffer.length : 0} bytes`,
                        );
                    } else {
                        logger.warn(
                            'PDF generation not available (puppeteer not installed) '
                            + '- sending email without attachment',
                        );
                    }
                } catch (pdfError) {
                    logger.error('Error generating estimate PDF:', pdfError);
                    logger.error('PDF error details:', pdfError.stack);
                }

                let updatedEstimate = estimate;
                if (estimate.status === 'draft') {
                    const updateResult = await client.query(`
                        UPDATE estimates SET
                            status = 'sent',
                            sent_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1 AND organization_id = $2
                        RETURNING ${estimateColumns()}
                    `, [id, req.organizationId]);
                    updatedEstimate = updateResult.rows[0];
                }

                let emailSent = false;
                let emailError = null;
                if (emailService.isEnabled()) {
                    try {
                        emailSent = await sendEstimateEmail(
                            emailService,
                            updatedEstimate,
                            {
                                ...settings,
                                business_name:
                                    estimate.business.name || settings.business_name,
                                business_email:
                                    estimate.business.email || settings.business_email,
                            },
                            pdfBuffer,
                        );
                        if (emailSent) {
                            logger.info(
                                `Estimate ${updatedEstimate.estimate_number} email sent `
                                + `to ${updatedEstimate.customer_email}`
                                + `${pdfBuffer ? ' with PDF' : ''}`,
                            );
                        } else {
                            emailError = 'Email service returned false';
                            logger.warn(
                                `Failed to send estimate `
                                + `${updatedEstimate.estimate_number} email`,
                            );
                        }
                    } catch (emailSendError) {
                        logger.error('Error sending estimate email:', emailSendError);
                        emailError = emailSendError.message;
                    }
                } else {
                    logger.warn(
                        'Email service not configured - estimate marked as sent '
                        + 'but no email delivered',
                    );
                    emailError = 'Email service not configured';
                }

                return {
                    data: {
                        ...updatedEstimate,
                        emailSent,
                        emailError: emailError || undefined,
                    },
                };
            });

            if (result.errorStatus) {
                return sendError(res, result.error, result.errorStatus);
            }
            return sendSuccess(res, result.data);
        } catch (error) {
            logger.error('Error sending estimate:', error);
            return sendError(res, 'Failed to send estimate');
        }
    });

    router.post(
        '/:id/convert-to-invoice',
        authenticateJWT,
        requireOrganization,
        async (req, res) => {
            try {
                const { id } = req.params;
                const result = await withTransaction(pool, async (client) => {
                    const estimateResult = await client.query(`
                        SELECT ${estimateColumns()} FROM estimates WHERE
                            id = $1 AND organization_id = $2
                        FOR UPDATE
                    `, [id, req.organizationId]);

                    if (estimateResult.rows.length === 0) {
                        return { status: 'not_found' };
                    }

                    const estimate = estimateResult.rows[0];
                    if (estimate.converted_invoice_id) {
                        return { status: 'already_converted' };
                    }

                    const itemsResult = await client.query(`
                        SELECT ${estimateItemColumns()} FROM estimate_items
                        WHERE estimate_id = $1 AND organization_id = $2
                        ORDER BY sort_order
                    `, [id, req.organizationId]);

                    const invoiceNumber = await allocateInvoiceNumber(
                        client,
                        req.organizationId,
                    );
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + 30);

                    const invoiceResult = await client.query(`
                        INSERT INTO invoices (
                            organization_id, invoice_number, contact_id,
                            customer_name, customer_email, customer_phone,
                            customer_address, due_date, subtotal, tax_amount,
                            discount_amount, discount_type, discount_value,
                            total, amount_due, notes, terms_and_conditions,
                            created_by
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9,
                            $10, $11, $12, $13, $14, $15, $16, $17, $18
                        )
                        RETURNING ${invoiceColumns()}
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
                        req.user.id,
                    ]);

                    const invoiceId = invoiceResult.rows[0].id;
                    if (itemsResult.rows.length > 0) {
                        const invoiceIds = [];
                        const organizationIds = [];
                        const productIds = [];
                        const names = [];
                        const descriptions = [];
                        const quantities = [];
                        const unitPrices = [];
                        const taxRates = [];
                        const taxAmounts = [];
                        const totals = [];
                        const sortOrders = [];

                        for (const item of itemsResult.rows) {
                            invoiceIds.push(invoiceId);
                            organizationIds.push(req.organizationId);
                            productIds.push(item.product_id);
                            names.push(item.name);
                            descriptions.push(item.description);
                            quantities.push(item.quantity);
                            unitPrices.push(item.unit_price);
                            taxRates.push(item.tax_rate);
                            taxAmounts.push(item.tax_amount);
                            totals.push(item.total);
                            sortOrders.push(item.sort_order);
                        }

                        await client.query(`
                            INSERT INTO invoice_items (
                                invoice_id, organization_id, product_id, name,
                                description, quantity, unit_price, tax_rate,
                                tax_amount, total, sort_order
                            ) SELECT ${INVOICE_ITEM_UNNEST_COLUMNS} FROM UNNEST(
                                $1::int[], $2::int[], $3::int[], $4::text[],
                                $5::text[], $6::numeric[], $7::numeric[],
                                $8::numeric[], $9::numeric[], $10::numeric[],
                                $11::int[]
                            ) AS items(
                                invoice_id, organization_id, product_id, name,
                                description, quantity, unit_price, tax_rate,
                                tax_amount, total, sort_order
                            )
                        `, [
                            invoiceIds,
                            organizationIds,
                            productIds,
                            names,
                            descriptions,
                            quantities,
                            unitPrices,
                            taxRates,
                            taxAmounts,
                            totals,
                            sortOrders,
                        ]);
                    }

                    await client.query(`
                        UPDATE estimates SET
                            converted_invoice_id = $1,
                            status = 'accepted',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2 AND organization_id = $3
                    `, [invoiceId, id, req.organizationId]);

                    return {
                        status: 'ok',
                        invoiceId,
                        invoiceNumber,
                    };
                });

                if (result.status === 'not_found') {
                    return sendNotFound(res, 'Estimate');
                }
                if (result.status === 'already_converted') {
                    return sendBadRequest(
                        res,
                        'Estimate already converted to invoice',
                    );
                }
                return sendSuccess(res, {
                    success: true,
                    invoice_id: result.invoiceId,
                    invoice_number: result.invoiceNumber,
                });
            } catch (error) {
                console.error('Error converting estimate to invoice:', error);
                return sendError(res, 'Failed to convert estimate to invoice');
            }
        },
    );

    return router;
};
