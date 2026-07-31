/**
 * Retained estimate action routes.
 *
 * Estimate CRUD and conversion are permanently GraphQL-owned. Sending remains
 * temporarily available as the final provider-backed rollback boundary.
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { withDbClient } = require('../utils/db');
const {
    sendSuccess,
    sendError,
} = require('../utils/response');
const emailService = require('../services/emailService');
const { sendEstimateEmail } = require('../services/invoice-email.service');
const {
    estimateColumns,
    estimateItemColumns,
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

    return router;
};
