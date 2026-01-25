/**
 * PDF Service
 * Generate PDF documents for invoices and estimates
 * Uses PDFKit for lightweight, pure JavaScript PDF generation
 */

const { logger } = require('../utils/logger');

// Try to load PDFKit
let PDFDocument = null;
try {
    PDFDocument = require('pdfkit');
    logger.info('PDFKit loaded - PDF generation enabled');
} catch (e) {
    logger.info('PDFKit not available - PDF generation will be disabled');
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Generate invoice PDF using PDFKit
 */
async function generateInvoicePDF(invoice, settings = {}) {
    if (!PDFDocument) {
        throw new Error('PDF generation not available - pdfkit not installed');
    }

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                size: 'A4', 
                margin: 50,
                bufferPages: true
            });
            
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.on('error', reject);

            // Use business info from invoice.business if available, otherwise fall back to settings
            const business = invoice.business || {
                name: settings.business_name,
                address: settings.business_address,
                email: settings.business_email,
                phone: settings.business_phone,
                logo_url: settings.logo_url,
                tax_id: settings.tax_id
            };

            const currency = invoice.currency || 'USD';
            const pageWidth = doc.page.width - 100; // 50 margin on each side

            // Colors
            const primaryColor = '#2563eb';
            const textColor = '#111827';
            const mutedColor = '#6b7280';
            const borderColor = '#e5e7eb';

            // ============ HEADER ============
            let yPos = 50;

            // Business name and info (left side)
            doc.fontSize(16).fillColor(textColor).font('Helvetica-Bold')
               .text(business.name || 'Company Name', 50, yPos);
            
            yPos += 20;
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica');
            
            if (business.address) {
                const addressLines = business.address.split('\n');
                addressLines.forEach(line => {
                    doc.text(line.trim(), 50, yPos);
                    yPos += 12;
                });
            }
            if (business.email) {
                doc.text(business.email, 50, yPos);
                yPos += 12;
            }
            if (business.phone) {
                doc.text(business.phone, 50, yPos);
                yPos += 12;
            }

            // INVOICE title and number (right side)
            doc.fontSize(28).fillColor(primaryColor).font('Helvetica-Bold')
               .text('INVOICE', 350, 50, { width: 195, align: 'right' });
            
            doc.fontSize(11).fillColor(mutedColor).font('Helvetica')
               .text(invoice.invoice_number, 350, 82, { width: 195, align: 'right' });

            // Status badge
            const statusColors = {
                draft: { bg: '#f3f4f6', text: '#374151' },
                sent: { bg: '#dbeafe', text: '#1e40af' },
                paid: { bg: '#d1fae5', text: '#065f46' },
                partial: { bg: '#fef3c7', text: '#92400e' },
                overdue: { bg: '#fee2e2', text: '#991b1b' },
                cancelled: { bg: '#f3f4f6', text: '#6b7280' }
            };
            const statusStyle = statusColors[invoice.status] || statusColors.draft;
            const statusText = (invoice.status || 'draft').toUpperCase();
            const statusWidth = doc.widthOfString(statusText) + 16;
            
            doc.roundedRect(545 - statusWidth, 100, statusWidth, 18, 9)
               .fill(statusStyle.bg);
            doc.fontSize(8).fillColor(statusStyle.text).font('Helvetica-Bold')
               .text(statusText, 545 - statusWidth, 105, { width: statusWidth, align: 'center' });

            // ============ BILL TO & DATES ============
            yPos = 150;
            
            // Bill To section
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica-Bold')
               .text('BILL TO', 50, yPos);
            yPos += 15;
            
            doc.fontSize(11).fillColor(textColor).font('Helvetica-Bold')
               .text(invoice.customer_name || 'Customer', 50, yPos);
            yPos += 15;
            
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica');
            if (invoice.customer_email) {
                doc.text(invoice.customer_email, 50, yPos);
                yPos += 12;
            }
            if (invoice.customer_phone) {
                doc.text(invoice.customer_phone, 50, yPos);
                yPos += 12;
            }
            if (invoice.customer_address) {
                const addressLines = invoice.customer_address.split('\n');
                addressLines.forEach(line => {
                    doc.text(line.trim(), 50, yPos);
                    yPos += 12;
                });
            }

            // Dates section (right side)
            let dateY = 150;
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica')
               .text('Issue Date:', 380, dateY)
               .fillColor(textColor).font('Helvetica-Bold')
               .text(formatDate(invoice.issue_date || invoice.created_at), 450, dateY);
            
            dateY += 18;
            doc.fillColor(mutedColor).font('Helvetica')
               .text('Due Date:', 380, dateY)
               .fillColor(textColor).font('Helvetica-Bold')
               .text(formatDate(invoice.due_date), 450, dateY);

            if (invoice.payment_terms) {
                dateY += 18;
                doc.fillColor(mutedColor).font('Helvetica')
                   .text('Terms:', 380, dateY)
                   .fillColor(textColor).font('Helvetica-Bold')
                   .text(invoice.payment_terms, 450, dateY);
            }

            // ============ LINE ITEMS TABLE ============
            const tableTop = Math.max(yPos, dateY) + 40;
            const tableLeft = 50;
            const colWidths = [250, 60, 90, 95]; // Description, Qty, Unit Price, Amount
            
            // Table header
            doc.fillColor('#f9fafb')
               .rect(tableLeft, tableTop, pageWidth, 25)
               .fill();
            
            doc.fontSize(8).fillColor(mutedColor).font('Helvetica-Bold');
            let xPos = tableLeft + 10;
            doc.text('DESCRIPTION', xPos, tableTop + 8);
            xPos += colWidths[0];
            doc.text('QTY', xPos, tableTop + 8, { width: colWidths[1], align: 'center' });
            xPos += colWidths[1];
            doc.text('UNIT PRICE', xPos, tableTop + 8, { width: colWidths[2], align: 'right' });
            xPos += colWidths[2];
            doc.text('AMOUNT', xPos, tableTop + 8, { width: colWidths[3], align: 'right' });

            // Table rows
            let rowY = tableTop + 30;
            const items = invoice.items || [];
            
            doc.fontSize(9).font('Helvetica');
            items.forEach((item, index) => {
                // Check if we need a new page
                if (rowY > 700) {
                    doc.addPage();
                    rowY = 50;
                }

                xPos = tableLeft + 10;
                doc.fillColor(textColor)
                   .text(item.name || item.description || '', xPos, rowY, { width: colWidths[0] - 20 });
                xPos += colWidths[0];
                doc.text(String(item.quantity || 1), xPos, rowY, { width: colWidths[1], align: 'center' });
                xPos += colWidths[1];
                doc.text(formatCurrency(item.unit_price, currency), xPos, rowY, { width: colWidths[2], align: 'right' });
                xPos += colWidths[2];
                doc.text(formatCurrency(item.total || (item.quantity * item.unit_price), currency), xPos, rowY, { width: colWidths[3], align: 'right' });

                // Row border
                rowY += 25;
                doc.strokeColor(borderColor).lineWidth(0.5)
                   .moveTo(tableLeft, rowY - 5)
                   .lineTo(tableLeft + pageWidth, rowY - 5)
                   .stroke();
            });

            // ============ TOTALS ============
            const totalsX = 380;
            let totalsY = rowY + 15;
            const totalsWidth = 165;

            // Subtotal
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica')
               .text('Subtotal', totalsX, totalsY)
               .fillColor(textColor)
               .text(formatCurrency(invoice.subtotal, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
            totalsY += 18;

            // Tax
            if (invoice.tax_amount > 0) {
                doc.fillColor(mutedColor)
                   .text('Tax', totalsX, totalsY)
                   .fillColor(textColor)
                   .text(formatCurrency(invoice.tax_amount, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
                totalsY += 18;
            }

            // Discount
            if (invoice.discount_amount > 0) {
                doc.fillColor(mutedColor)
                   .text('Discount', totalsX, totalsY)
                   .fillColor('#059669')
                   .text('-' + formatCurrency(invoice.discount_amount, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
                totalsY += 18;
            }

            // Total line
            totalsY += 5;
            doc.strokeColor(textColor).lineWidth(1.5)
               .moveTo(totalsX, totalsY)
               .lineTo(totalsX + totalsWidth, totalsY)
               .stroke();
            totalsY += 10;

            // Grand Total
            doc.fontSize(12).fillColor(textColor).font('Helvetica-Bold')
               .text('Total', totalsX, totalsY)
               .text(formatCurrency(invoice.total, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
            totalsY += 22;

            // Amount Paid & Due (if applicable)
            if (invoice.amount_paid > 0) {
                doc.fontSize(9).fillColor('#059669').font('Helvetica')
                   .text('Paid', totalsX, totalsY)
                   .text('-' + formatCurrency(invoice.amount_paid, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
                totalsY += 18;

                doc.fontSize(11).fillColor(textColor).font('Helvetica-Bold')
                   .text('Amount Due', totalsX, totalsY)
                   .text(formatCurrency(invoice.amount_due, currency), totalsX, totalsY, { width: totalsWidth, align: 'right' });
            }

            // ============ NOTES & TERMS ============
            let notesY = totalsY + 40;

            if (invoice.notes) {
                // Check if we need a new page
                if (notesY > 680) {
                    doc.addPage();
                    notesY = 50;
                }

                doc.fillColor('#f9fafb')
                   .roundedRect(50, notesY, pageWidth, 60, 5)
                   .fill();
                
                doc.fontSize(9).fillColor(textColor).font('Helvetica-Bold')
                   .text('Notes', 60, notesY + 10);
                doc.fontSize(9).fillColor(mutedColor).font('Helvetica')
                   .text(invoice.notes, 60, notesY + 25, { width: pageWidth - 20 });
                
                notesY += 70;
            }

            if (invoice.terms_and_conditions) {
                // Check if we need a new page
                if (notesY > 680) {
                    doc.addPage();
                    notesY = 50;
                }

                doc.fillColor('#f9fafb')
                   .roundedRect(50, notesY, pageWidth, 60, 5)
                   .fill();
                
                doc.fontSize(9).fillColor(textColor).font('Helvetica-Bold')
                   .text('Terms & Conditions', 60, notesY + 10);
                doc.fontSize(8).fillColor(mutedColor).font('Helvetica')
                   .text(invoice.terms_and_conditions, 60, notesY + 25, { width: pageWidth - 20 });
                
                notesY += 70;
            }

            // ============ FOOTER ============
            const footerY = doc.page.height - 60;
            
            if (business.tax_id) {
                doc.fontSize(8).fillColor(mutedColor).font('Helvetica')
                   .text(`Tax ID: ${business.tax_id}`, 50, footerY, { width: pageWidth, align: 'center' });
            }
            
            doc.fontSize(9).fillColor(mutedColor).font('Helvetica')
               .text('Thank you for your business!', 50, footerY + 15, { width: pageWidth, align: 'center' });

            // Finalize the PDF
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Generate invoice HTML template (kept for backwards compatibility / preview)
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

    const itemsHTML = (invoice.items || []).map(item => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name || item.description || ''}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity || 1}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unit_price, currency)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.total || (item.quantity * item.unit_price), currency)}</td>
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
                .invoice-title { font-size: 32px; font-weight: 300; color: #2563eb; }
                .invoice-number { font-size: 14px; color: #6b7280; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th { padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6b7280; }
                th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
                td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
                .totals { margin-left: auto; width: 280px; }
                .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
                .total-row.grand { font-size: 18px; font-weight: 600; border-top: 2px solid #111827; padding-top: 12px; margin-top: 8px; }
                .notes { margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
                .notes-title { font-weight: 600; margin-bottom: 8px; }
                .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div style="font-weight: 600; font-size: 16px;">${business.name || ''}</div>
                    <div style="color: #6b7280; font-size: 12px;">${(business.address || '').replace(/\n/g, '<br>')}</div>
                    ${business.email ? `<div style="color: #6b7280; font-size: 12px;">${business.email}</div>` : ''}
                    ${business.phone ? `<div style="color: #6b7280; font-size: 12px;">${business.phone}</div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div class="invoice-title">INVOICE</div>
                    <div class="invoice-number">${invoice.invoice_number}</div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Bill To</div>
                    <div style="font-weight: 600;">${invoice.customer_name || ''}</div>
                    ${invoice.customer_email ? `<div>${invoice.customer_email}</div>` : ''}
                    ${invoice.customer_phone ? `<div>${invoice.customer_phone}</div>` : ''}
                </div>
                <div>
                    <div><span style="color: #6b7280;">Issue Date:</span> ${formatDate(invoice.issue_date || invoice.created_at)}</div>
                    <div><span style="color: #6b7280;">Due Date:</span> ${formatDate(invoice.due_date)}</div>
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
                    <span>${formatCurrency(invoice.subtotal, currency)}</span>
                </div>
                ${invoice.tax_amount > 0 ? `
                <div class="total-row">
                    <span>Tax</span>
                    <span>${formatCurrency(invoice.tax_amount, currency)}</span>
                </div>` : ''}
                ${invoice.discount_amount > 0 ? `
                <div class="total-row">
                    <span>Discount</span>
                    <span>-${formatCurrency(invoice.discount_amount, currency)}</span>
                </div>` : ''}
                <div class="total-row grand">
                    <span>Total</span>
                    <span>${formatCurrency(invoice.total, currency)}</span>
                </div>
                ${invoice.amount_paid > 0 ? `
                <div class="total-row" style="color: #059669;">
                    <span>Paid</span>
                    <span>-${formatCurrency(invoice.amount_paid, currency)}</span>
                </div>
                <div class="total-row" style="font-weight: 600;">
                    <span>Amount Due</span>
                    <span>${formatCurrency(invoice.amount_due, currency)}</span>
                </div>` : ''}
            </div>

            ${invoice.notes ? `
            <div class="notes">
                <div class="notes-title">Notes</div>
                <div>${invoice.notes}</div>
            </div>` : ''}

            <div class="footer">
                ${business.tax_id ? `<div>Tax ID: ${business.tax_id}</div>` : ''}
                <div style="margin-top: 8px;">Thank you for your business!</div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Check if PDF generation is available
 */
function isPDFAvailable() {
    return PDFDocument !== null;
}

module.exports = {
    generateInvoicePDF,
    generateInvoiceHTML,
    isPDFAvailable
};
