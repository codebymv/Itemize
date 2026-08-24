/**
 * PDF Service
 * Compatibility facade for invoice PDF generation.
 */

const { logger } = require('./logger');
const { generatePDF, isPDFAvailable } = require('./pdf/renderer');
const { generateInvoiceHTML } = require('./pdf/invoice-template');

async function generateInvoicePDF(invoice, settings = {}) {
    logger.info(`Generating PDF for invoice: ${invoice.invoice_number}`);

    const businessLogoUrl = invoice.business?.logo_url;
    const settingsLogoUrl = settings.logo_url;
    logger.info(`Logo URL - Business: ${businessLogoUrl || 'none'}, Settings: ${settingsLogoUrl || 'none'}`);

    const html = await generateInvoiceHTML(invoice, settings);
    return generatePDF(html);
}

module.exports = {
    generateInvoicePDF,
    generateInvoiceHTML,
    generatePDF,
    isPDFAvailable
};
