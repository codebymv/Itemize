/**
 * PDF Service
 * Generate PDF documents for invoices and estimates
 * Uses puppeteer for HTML-to-PDF conversion
 */

const { logger } = require('../utils/logger');

// Try to load puppeteer if available
let puppeteer = null;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    logger.info('Puppeteer not available - PDF generation will be disabled');
}

/**
 * Generate invoice HTML template
 */
function generateInvoiceHTML(invoice, settings = {}) {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: invoice.currency || 'USD'
        }).format(amount || 0);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Use business info from invoice.business if available, otherwise fall back to settings
    const business = invoice.business || {
        name: settings.business_name,
        address: settings.business_address,
        email: settings.business_email,
        phone: settings.business_phone,
        logo_url: settings.logo_url,
        tax_id: settings.tax_id
    };

    const itemsHTML = (invoice.items || []).map(item => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unit_price)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.total)}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                    font-size: 14px;
                    line-height: 1.5;
                    color: #111827;
                    padding: 40px;
                }
                .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
                .logo { max-width: 180px; max-height: 60px; }
                .invoice-title { font-size: 32px; font-weight: 300; color: #2563eb; }
                .invoice-number { font-size: 14px; color: #6b7280; margin-top: 4px; }
                .addresses { display: flex; justify-content: space-between; margin-bottom: 40px; }
                .address-block { width: 45%; }
                .address-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
                .address-content { font-size: 14px; }
                .meta-row { display: flex; margin-bottom: 8px; }
                .meta-label { width: 120px; color: #6b7280; }
                .meta-value { font-weight: 500; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th { 
                    padding: 12px; 
                    text-align: left; 
                    border-bottom: 2px solid #e5e7eb;
                    font-weight: 600;
                    font-size: 12px;
                    text-transform: uppercase;
                    color: #6b7280;
                }
                th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
                td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
                .totals { margin-left: auto; width: 280px; }
                .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
                .total-row.grand { 
                    font-size: 18px; 
                    font-weight: 600; 
                    border-top: 2px solid #111827;
                    padding-top: 12px;
                    margin-top: 8px;
                }
                .notes { margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
                .notes-title { font-weight: 600; margin-bottom: 8px; }
                .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px; }
                .status-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    font-size: 12px;
                    font-weight: 500;
                    text-transform: uppercase;
                }
                .status-draft { background: #f3f4f6; color: #374151; }
                .status-sent { background: #dbeafe; color: #1e40af; }
                .status-paid { background: #d1fae5; color: #065f46; }
                .status-overdue { background: #fee2e2; color: #991b1b; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    ${business.logo_url ? `<img src="${business.logo_url}" class="logo" alt="Logo">` : ''}
                    <div style="margin-top: 8px;">
                        <div style="font-weight: 600;">${business.name || ''}</div>
                        <div style="white-space: pre-line; color: #6b7280; font-size: 12px;">${business.address || ''}</div>
                        ${business.email ? `<div style="color: #6b7280; font-size: 12px;">${business.email}</div>` : ''}
                        ${business.phone ? `<div style="color: #6b7280; font-size: 12px;">${business.phone}</div>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="invoice-title">INVOICE</div>
                    <div class="invoice-number">${invoice.invoice_number}</div>
                    <div style="margin-top: 12px;">
                        <span class="status-badge status-${invoice.status}">${invoice.status}</span>
                    </div>
                </div>
            </div>

            <div class="addresses">
                <div class="address-block">
                    <div class="address-label">Bill To</div>
                    <div class="address-content">
                        <div style="font-weight: 600;">${invoice.customer_name || ''}</div>
                        ${invoice.customer_email ? `<div>${invoice.customer_email}</div>` : ''}
                        ${invoice.customer_phone ? `<div>${invoice.customer_phone}</div>` : ''}
                        ${invoice.customer_address ? `<div style="white-space: pre-line;">${invoice.customer_address}</div>` : ''}
                    </div>
                </div>
                <div class="address-block">
                    <div class="meta-row">
                        <span class="meta-label">Issue Date:</span>
                        <span class="meta-value">${formatDate(invoice.issue_date || invoice.created_at)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Due Date:</span>
                        <span class="meta-value">${formatDate(invoice.due_date)}</span>
                    </div>
                    ${invoice.payment_terms ? `
                    <div class="meta-row">
                        <span class="meta-label">Payment Terms:</span>
                        <span class="meta-value">${invoice.payment_terms}</span>
                    </div>
                    ` : ''}
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 50%;">Description</th>
                        <th style="width: 15%;">Qty</th>
                        <th style="width: 17%;">Unit Price</th>
                        <th style="width: 18%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>

            <div class="totals">
                <div class="total-row">
                    <span>Subtotal</span>
                    <span>${formatCurrency(invoice.subtotal)}</span>
                </div>
                ${invoice.tax_amount > 0 ? `
                <div class="total-row">
                    <span>Tax</span>
                    <span>${formatCurrency(invoice.tax_amount)}</span>
                </div>
                ` : ''}
                ${invoice.discount_amount > 0 ? `
                <div class="total-row">
                    <span>Discount</span>
                    <span>-${formatCurrency(invoice.discount_amount)}</span>
                </div>
                ` : ''}
                <div class="total-row grand">
                    <span>Total</span>
                    <span>${formatCurrency(invoice.total)}</span>
                </div>
                ${invoice.amount_paid > 0 ? `
                <div class="total-row" style="color: #059669;">
                    <span>Paid</span>
                    <span>-${formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div class="total-row" style="font-weight: 600;">
                    <span>Amount Due</span>
                    <span>${formatCurrency(invoice.amount_due)}</span>
                </div>
                ` : ''}
            </div>

            ${invoice.notes ? `
            <div class="notes">
                <div class="notes-title">Notes</div>
                <div style="white-space: pre-line;">${invoice.notes}</div>
            </div>
            ` : ''}

            ${invoice.terms_and_conditions ? `
            <div class="notes" style="margin-top: 20px;">
                <div class="notes-title">Terms & Conditions</div>
                <div style="white-space: pre-line; font-size: 12px;">${invoice.terms_and_conditions}</div>
            </div>
            ` : ''}

            <div class="footer">
                ${business.tax_id ? `<div>Tax ID: ${business.tax_id}</div>` : ''}
                <div style="margin-top: 8px;">Thank you for your business!</div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Generate PDF from HTML
 */
async function generatePDF(html) {
    if (!puppeteer) {
        throw new Error('PDF generation not available - puppeteer not installed');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm'
            }
        });

        return pdf;
    } finally {
        await browser.close();
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
    return puppeteer !== null;
}

module.exports = {
    generateInvoicePDF,
    generateInvoiceHTML,
    generatePDF,
    isPDFAvailable
};
