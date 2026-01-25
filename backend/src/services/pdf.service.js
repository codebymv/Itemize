/**
 * PDF Service
 * Generate PDF documents for invoices and estimates
 * Uses puppeteer-core with @sparticuz/chromium for HTML-to-PDF conversion
 * This ensures 100% parity between the frontend preview and the generated PDF
 */

const { logger } = require('../utils/logger');

// Try to load puppeteer-core and chromium
let puppeteer = null;
let chromium = null;

try {
    puppeteer = require('puppeteer-core');
    chromium = require('@sparticuz/chromium');
    logger.info('Puppeteer-core and Chromium loaded - PDF generation enabled');
} catch (e) {
    logger.info('Puppeteer not available - PDF generation will be disabled');
    logger.info('Error:', e.message);
}

/**
 * Format currency - matches frontend exactly
 */
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount || 0);
}

/**
 * Format date - matches frontend exactly (handles timezone issues)
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    // Handle both ISO strings and YYYY-MM-DD format
    let date;
    if (dateStr.includes('T')) {
        // For ISO strings, extract just the date part to avoid timezone shifts
        const datePart = dateStr.split('T')[0];
        const [year, month, day] = datePart.split('-').map(Number);
        date = new Date(year, month - 1, day);
    } else {
        const [year, month, day] = dateStr.split('-').map(Number);
        date = new Date(year, month - 1, day);
    }
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Generate invoice HTML template
 * This is the EXACT same layout as the frontend InvoicePreview component
 * Any changes here should be mirrored in the frontend preview
 */
function generateInvoiceHTML(invoice, settings = {}) {
    const business = invoice.business || {
        name: settings.business_name,
        address: settings.business_address,
        email: settings.business_email,
        phone: settings.business_phone,
        logo_url: settings.logo_url,
        tax_id: settings.tax_id
    };

    const currency = invoice.currency || 'USD';
    const status = invoice.status || 'draft';

    // Status badge styles - matching frontend exactly
    const statusStyles = {
        draft: 'background: #f3f4f6; color: #374151;',
        sent: 'background: #dbeafe; color: #1e40af;',
        viewed: 'background: #dbeafe; color: #1e40af;',
        paid: 'background: #d1fae5; color: #065f46;',
        partial: 'background: #fef3c7; color: #92400e;',
        overdue: 'background: #fee2e2; color: #991b1b;',
        cancelled: 'background: #f3f4f6; color: #6b7280;'
    };
    const statusStyle = statusStyles[status] || statusStyles.draft;

    // Generate line items HTML
    const items = invoice.items || [];
    const itemsHTML = items.map(item => {
        const quantity = item.quantity || 1;
        const unitPrice = item.unit_price || 0;
        const lineTotal = item.total || (quantity * unitPrice);
        const itemName = item.name || item.description || '';
        const itemDesc = item.description && item.name !== item.description ? item.description : '';

        return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0;">
                    <p style="margin: 0; font-weight: 500;">${escapeHtml(itemName)}</p>
                    ${itemDesc ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">${escapeHtml(itemDesc)}</p>` : ''}
                </td>
                <td style="padding: 12px 0; text-align: right;">${quantity}</td>
                <td style="padding: 12px 0; text-align: right;">${formatCurrency(unitPrice, currency)}</td>
                <td style="padding: 12px 0; text-align: right;">${formatCurrency(lineTotal, currency)}</td>
            </tr>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #111827;
                    background: white;
                    padding: 40px;
                }
                .invoice-container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 32px;
                }
                .business-info {
                    font-size: 14px;
                }
                .business-info .name {
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .business-info .details {
                    color: #6b7280;
                    font-size: 12px;
                }
                .invoice-title {
                    text-align: right;
                }
                .invoice-title h1 {
                    font-size: 32px;
                    font-weight: 300;
                    color: #2563eb;
                    margin: 0 0 4px 0;
                }
                .invoice-number {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 8px;
                }
                .status-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    text-transform: uppercase;
                    ${statusStyle}
                }
                .addresses {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 32px;
                }
                .bill-to {
                    width: 50%;
                }
                .bill-to-label {
                    font-size: 11px;
                    color: #6b7280;
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    letter-spacing: 0.5px;
                }
                .customer-name {
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .customer-details {
                    color: #6b7280;
                    font-size: 14px;
                }
                .dates {
                    width: 50%;
                    text-align: right;
                }
                .date-row {
                    display: flex;
                    justify-content: flex-end;
                    gap: 16px;
                    margin-bottom: 4px;
                    font-size: 14px;
                }
                .date-label {
                    color: #6b7280;
                }
                .date-value {
                    font-weight: 500;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 32px;
                }
                thead tr {
                    border-bottom: 2px solid #e5e7eb;
                }
                th {
                    padding: 8px 0;
                    text-align: left;
                    font-size: 11px;
                    color: #6b7280;
                    text-transform: uppercase;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                }
                th:nth-child(2),
                th:nth-child(3),
                th:nth-child(4) {
                    text-align: right;
                }
                .totals-container {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 32px;
                }
                .totals {
                    width: 256px;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 0;
                    font-size: 14px;
                }
                .total-separator {
                    border-top: 1px solid #e5e7eb;
                    margin: 8px 0;
                }
                .grand-total {
                    font-size: 18px;
                    font-weight: 700;
                }
                .notes-box {
                    background: #f9fafb;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                .notes-label {
                    font-size: 11px;
                    color: #6b7280;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                    letter-spacing: 0.5px;
                }
                .notes-content {
                    font-size: 14px;
                    white-space: pre-line;
                }
                .terms-content {
                    font-size: 12px;
                    color: #6b7280;
                    white-space: pre-line;
                }
                .footer {
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                    margin-top: 32px;
                }
                .logo {
                    max-height: 48px;
                    max-width: 180px;
                    object-fit: contain;
                    margin-bottom: 8px;
                }
                .paid-amount {
                    color: #059669;
                }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <!-- Header -->
                <div class="header">
                    <div class="business-info">
                        ${business.logo_url ? `<img src="${business.logo_url}" class="logo" alt="Logo" crossorigin="anonymous">` : ''}
                        ${business.name ? `
                            <div class="name">${escapeHtml(business.name)}</div>
                            <div class="details">
                                ${business.address ? `<div style="white-space: pre-line;">${escapeHtml(business.address)}</div>` : ''}
                                ${business.email ? `<div>${escapeHtml(business.email)}</div>` : ''}
                                ${business.phone ? `<div>${escapeHtml(business.phone)}</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                    <div class="invoice-title">
                        <h1>INVOICE</h1>
                        ${invoice.invoice_number ? `<div class="invoice-number">${escapeHtml(invoice.invoice_number)}</div>` : ''}
                        <span class="status-badge">${status.toUpperCase()}</span>
                    </div>
                </div>

                <!-- Addresses and Dates -->
                <div class="addresses">
                    <div class="bill-to">
                        <div class="bill-to-label">Bill To</div>
                        ${invoice.customer_name ? `<div class="customer-name">${escapeHtml(invoice.customer_name)}</div>` : ''}
                        <div class="customer-details">
                            ${invoice.customer_email ? `<div>${escapeHtml(invoice.customer_email)}</div>` : ''}
                            ${invoice.customer_phone ? `<div>${escapeHtml(invoice.customer_phone)}</div>` : ''}
                            ${invoice.customer_address ? `<div style="white-space: pre-line;">${escapeHtml(invoice.customer_address)}</div>` : ''}
                        </div>
                    </div>
                    <div class="dates">
                        <div class="date-row">
                            <span class="date-label">Issue Date:</span>
                            <span class="date-value">${formatDate(invoice.issue_date || invoice.created_at)}</span>
                        </div>
                        <div class="date-row">
                            <span class="date-label">Due Date:</span>
                            <span class="date-value">${formatDate(invoice.due_date)}</span>
                        </div>
                    </div>
                </div>

                <!-- Line Items Table -->
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50%;">Description</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>

                <!-- Totals -->
                <div class="totals-container">
                    <div class="totals">
                        <div class="total-row">
                            <span>Subtotal</span>
                            <span>${formatCurrency(invoice.subtotal, currency)}</span>
                        </div>
                        ${invoice.tax_amount > 0 ? `
                            <div class="total-row">
                                <span>Tax</span>
                                <span>${formatCurrency(invoice.tax_amount, currency)}</span>
                            </div>
                        ` : ''}
                        ${invoice.discount_amount > 0 ? `
                            <div class="total-row">
                                <span>Discount</span>
                                <span>-${formatCurrency(invoice.discount_amount, currency)}</span>
                            </div>
                        ` : ''}
                        <div class="total-separator"></div>
                        <div class="total-row grand-total">
                            <span>Total</span>
                            <span>${formatCurrency(invoice.total, currency)}</span>
                        </div>
                        ${invoice.amount_paid > 0 ? `
                            <div class="total-row paid-amount">
                                <span>Paid</span>
                                <span>-${formatCurrency(invoice.amount_paid, currency)}</span>
                            </div>
                            <div class="total-row" style="font-weight: 600;">
                                <span>Amount Due</span>
                                <span>${formatCurrency(invoice.amount_due, currency)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Notes -->
                ${invoice.notes ? `
                    <div class="notes-box">
                        <div class="notes-label">Notes</div>
                        <div class="notes-content">${escapeHtml(invoice.notes)}</div>
                    </div>
                ` : ''}

                <!-- Terms & Conditions -->
                ${invoice.terms_and_conditions ? `
                    <div class="notes-box">
                        <div class="notes-label">Terms & Conditions</div>
                        <div class="terms-content">${escapeHtml(invoice.terms_and_conditions)}</div>
                    </div>
                ` : ''}

                <!-- Footer -->
                <div class="footer">
                    ${business.tax_id ? `<div>Tax ID: ${escapeHtml(business.tax_id)}</div>` : ''}
                    <div style="margin-top: 8px;">Thank you for your business!</div>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate PDF from HTML using Puppeteer
 */
async function generatePDF(html) {
    if (!puppeteer || !chromium) {
        throw new Error('PDF generation not available - puppeteer-core or chromium not installed');
    }

    let browser = null;
    
    try {
        // Configure chromium for serverless environment
        const executablePath = await chromium.executablePath();
        
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        // Set content and wait for everything to load
        await page.setContent(html, { 
            waitUntil: ['networkidle0', 'domcontentloaded']
        });

        // Generate PDF
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                right: '15mm',
                bottom: '15mm',
                left: '15mm'
            }
        });

        return Buffer.from(pdf);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Generate invoice PDF
 */
async function generateInvoicePDF(invoice, settings = {}) {
    const html = generateInvoiceHTML(invoice, settings);
    return generatePDF(html);
}

/**
 * Check if PDF generation is available
 */
function isPDFAvailable() {
    return puppeteer !== null && chromium !== null;
}

module.exports = {
    generateInvoicePDF,
    generateInvoiceHTML,
    generatePDF,
    isPDFAvailable
};
