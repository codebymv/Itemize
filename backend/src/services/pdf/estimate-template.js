const {
    formatCurrency,
    formatDate,
    convertImageToDataUrl,
    getItemizeIconAsync,
    getItemizeTextBlackAsync,
    escapeHtml
} = require('./utils');

async function generateEstimateHTML(estimate, settings = {}) {
    const business = estimate.business || {
        name: settings.business_name,
        address: settings.business_address,
        email: settings.business_email,
        phone: settings.business_phone,
        logo_url: settings.logo_url,
        tax_id: settings.tax_id
    };
    
    // Convert logo URL to base64 data URL for reliable PDF embedding
    // Check both business.logo_url and settings.logo_url
    const rawLogoUrl = business.logo_url || settings.logo_url;
    if (rawLogoUrl) {
        business.logo_url = await convertImageToDataUrl(rawLogoUrl);
    }

    const iconDataUrl = await getItemizeIconAsync();
    const textDataUrl = await getItemizeTextBlackAsync();

    const currency = estimate.currency || 'USD';

    // Generate line items HTML
    const items = estimate.items || [];
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
                    @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    body {
                        font-family: 'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #111827;
                        background: white;
                        padding: 40px;
                        padding-bottom: 0;
                        display: flex;
                        flex-direction: column;
                        min-height: 100vh;
                        box-sizing: border-box;
                    }
                    .invoice-container {
                        max-width: 100%;
                        width: 100%;
                        margin: 0 auto;
                        background: white;
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    }
                    .invoice-content {
                        flex: 1;
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
                    .estimate-title {
                        text-align: right;
                    }
                    .estimate-title h1 {
                        font-size: 32px;
                        font-weight: 300;
                        color: #059669;
                        margin: 0 0 4px 0;
                    }
                    .estimate-number {
                        font-size: 14px;
                        color: #6b7280;
                        margin-bottom: 8px;
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
                        border-bottom: 2px solid #059669;
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
                    .powered-by-footer {
                        margin-top: auto;
                        margin-left: -40px;
                        margin-right: -40px;
                        margin-bottom: 0;
                        padding: 16px 24px;
                        background-color: #059669;
                        border-radius: 0;
                        text-align: center;
                        color: #ffffff;
                        font-size: 14px;
                        width: calc(100% + 80px);
                    }
                    .powered-by-footer .powered-by-text {
                        margin-right: 8px;
                    }
                    .powered-by-footer .powered-by-card {
                        background-color: #ffffff;
                        padding: 8px 12px;
                        border-radius: 6px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        text-decoration: none;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }
                    .powered-by-footer .powered-by-card:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                    }
                    .powered-by-footer .itemize-icon {
                        height: 24px;
                        width: auto;
                        display: inline-block;
                        vertical-align: middle;
                    }
                    .powered-by-footer .itemize-text {
                        height: 20px;
                        width: auto;
                        display: inline-block;
                        vertical-align: middle;
                    }
                    .logo {
                        max-height: 48px;
                        max-width: 180px;
                        object-fit: contain;
                        margin-bottom: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">
                    <div class="invoice-content">
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
                            <div class="estimate-title">
                                <h1>ESTIMATE</h1>
                                ${estimate.estimate_number ? `<div class="estimate-number">${escapeHtml(estimate.estimate_number)}</div>` : ''}
                            </div>
                        </div>

                        <!-- Addresses and Dates -->
                        <div class="addresses">
                            <div class="bill-to">
                                <div class="bill-to-label">Bill To</div>
                                ${estimate.customer_name ? `<div class="customer-name">${escapeHtml(estimate.customer_name)}</div>` : ''}
                                <div class="customer-details">
                                    ${estimate.customer_email ? `<div>${escapeHtml(estimate.customer_email)}</div>` : ''}
                                    ${estimate.customer_phone ? `<div>${escapeHtml(estimate.customer_phone)}</div>` : ''}
                                    ${estimate.customer_address ? `<div style="white-space: pre-line;">${escapeHtml(estimate.customer_address)}</div>` : ''}
                                </div>
                            </div>
                            <div class="dates">
                                <div class="date-row">
                                    <span class="date-label">Issue Date:</span>
                                    <span class="date-value">${formatDate(estimate.issue_date || estimate.created_at)}</span>
                                </div>
                                <div class="date-row">
                                    <span class="date-label">Valid Until:</span>
                                    <span class="date-value">${formatDate(estimate.valid_until)}</span>
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
                                    <span>${formatCurrency(estimate.subtotal, currency)}</span>
                                </div>
                                ${estimate.tax_amount > 0 ? `
                                    <div class="total-row">
                                        <span>Tax</span>
                                        <span>${formatCurrency(estimate.tax_amount, currency)}</span>
                                    </div>
                                ` : ''}
                                ${estimate.discount_amount > 0 ? `
                                    <div class="total-row">
                                        <span>Discount</span>
                                        <span>-${formatCurrency(estimate.discount_amount, currency)}</span>
                                    </div>
                                ` : ''}
                                <div class="total-separator"></div>
                                <div class="total-row grand-total">
                                    <span>Total</span>
                                    <span>${formatCurrency(estimate.total, currency)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Notes -->
                        ${estimate.notes ? `
                            <div class="notes-box">
                                <div class="notes-label">Notes</div>
                                <div class="notes-content">${escapeHtml(estimate.notes)}</div>
                            </div>
                        ` : ''}

                        <!-- Terms & Conditions -->
                        ${estimate.terms_and_conditions ? `
                            <div class="notes-box">
                                <div class="notes-label">Terms & Conditions</div>
                                <div class="terms-content">${escapeHtml(estimate.terms_and_conditions)}</div>
                            </div>
                        ` : ''}

                        <!-- Footer -->
                        <div class="footer">
                            ${business.tax_id ? `<div>Tax ID: ${escapeHtml(business.tax_id)}</div>` : ''}
                            <div style="margin-top: 8px;">This estimate is valid until ${formatDate(estimate.valid_until)}</div>
                        </div>
                    </div>
                    <!-- /.invoice-content -->

                    <!-- Powered By Footer -->
                    <div class="powered-by-footer">
                        <span class="powered-by-text">Powered by</span>
                        <a href="https://itemize.cloud" target="_blank" rel="noopener noreferrer" class="powered-by-card">
                            ${(() => {
                                let logoHtml = '';
                                if (iconDataUrl) {
                                    logoHtml += `<img src="${iconDataUrl}" class="itemize-icon" alt="itemize" />`;
                                }
                                if (textDataUrl) {
                                    logoHtml += `<img src="${textDataUrl}" class="itemize-text" alt="itemize.cloud" />`;
                                }
                                if (!logoHtml) {
                                    return '<span style="color: #111827; font-weight: 500;">itemize.cloud</span>';
                                }
                                return logoHtml;
                            })()}
                        </a>
                    </div>
                </div>
            </body>
        </html>
    `;
}

/**
 * Generate estimate PDF
 */

module.exports = {
    generateEstimateHTML
};
