const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendSuccess, sendBadRequest } = require('../../utils/response');

module.exports = ({ pool: _pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Invoice Email Preview
    // ======================

    /**
     * POST /api/invoices/email/preview - Generate invoice email preview
     * Returns the HTML that would be sent, wrapped in branded template
     */
        router.post('/email/preview', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { message, subject, includePaymentLink, baseUrl } = req.body;

            if (!message || !message.trim()) {
                return sendBadRequest(res, 'Message content is required');
            }

            // Import the branded template wrapper
            const { wrapInBrandedTemplate } = require('../../services/email-template.service');

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
                showUnsubscribe: false, // Transactional emails don't need unsubscribe
                baseUrl
            });

            return sendSuccess(res, {
                html: previewHtml
            });
    }));

    return router;
};
