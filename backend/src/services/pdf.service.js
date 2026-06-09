/**
 * PDF Service
 * Compatibility facade for invoice and estimate PDF generation.
 */

const { logger } = require('../utils/logger');
const { generatePDF, isPDFAvailable } = require('./pdf/renderer');
const { generateInvoiceHTML } = require('./pdf/invoice-template');
const { generateEstimateHTML } = require('./pdf/estimate-template');

async function generateInvoicePDF(invoice, settings = {}) {
    logger.info(`Generating PDF for invoice: ${invoice.invoice_number}`);

    const businessLogoUrl = invoice.business?.logo_url;
    const settingsLogoUrl = settings.logo_url;
    logger.info(`Logo URL - Business: ${businessLogoUrl || 'none'}, Settings: ${settingsLogoUrl || 'none'}`);

    const html = await generateInvoiceHTML(invoice, settings);
    return generatePDF(html);
}

async function generateEstimatePDF(estimate, settings = {}) {
    logger.info(`Generating PDF for estimate: ${estimate.estimate_number}`);

    const html = await generateEstimateHTML(estimate, settings);
    return generatePDF(html);
}

function isEstimatePDFAvailable() {
    return isPDFAvailable();
}

module.exports = {
    generateInvoicePDF,
    generateInvoiceHTML,
    generateEstimatePDF,
    generateEstimateHTML,
    generatePDF,
    isPDFAvailable,
    isEstimatePDFAvailable
};
