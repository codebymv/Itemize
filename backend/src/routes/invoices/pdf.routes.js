const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendNotFound, sendError } = require('../../utils/response');
const {
    INVOICE_COLUMNS,
    INVOICE_ITEM_COLUMNS,
    PAYMENT_SETTINGS_COLUMNS,
    selectColumns,
} = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // Retained HTTP fallback for the binary PDF protocol. The origin-level
    // proxy takes this path first when Nest ownership is enabled.
    router.get('/:id/pdf', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            if (isNaN(parseInt(id))) {
                return sendNotFound(res, 'Invoice');
            }

            const { generateInvoicePDF, isPDFAvailable } = require('../../services/pdf.service');
            if (!isPDFAvailable()) {
                return sendError(res, 'PDF generation not available', 503, 'SERVICE_UNAVAILABLE');
            }

            const pdfData = await withDbClient(pool, async (client) => {
                const invoiceResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_COLUMNS, 'i')},
                           c.first_name as contact_first_name,
                           c.last_name as contact_last_name
                    FROM invoices i
                    LEFT JOIN contacts c ON i.contact_id = c.id
                    WHERE i.id = $1 AND i.organization_id = $2
                `, [id, req.organizationId]);

                if (invoiceResult.rows.length === 0) {
                    return { notFound: true };
                }

                const invoice = invoiceResult.rows[0];
                const itemsResult = await client.query(`
                    SELECT ${selectColumns(INVOICE_ITEM_COLUMNS)}
                    FROM invoice_items
                    WHERE invoice_id = $1
                    ORDER BY sort_order
                `, [id]);
                invoice.items = itemsResult.rows;

                const settingsResult = await client.query(
                    `SELECT ${selectColumns(PAYMENT_SETTINGS_COLUMNS)}
                     FROM payment_settings
                     WHERE organization_id = $1`,
                    [req.organizationId]
                );
                return { invoice, settings: settingsResult.rows[0] || {} };
            });

            if (pdfData.notFound) {
                return sendNotFound(res, 'Invoice');
            }

            const pdf = await generateInvoicePDF(pdfData.invoice, pdfData.settings);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${pdfData.invoice.invoice_number}.pdf"`
            );
            res.setHeader('Content-Length', pdf.length);
            return res.send(pdf);
        } catch (error) {
            console.error('Error generating PDF:', error);
            return sendError(res, 'Failed to generate PDF');
        }
    }));

    return router;
};
