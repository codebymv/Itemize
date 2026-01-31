/**
 * PDF Service
 * Generate PDF documents for invoices and estimates
 * Uses puppeteer for HTML-to-PDF conversion
 * This ensures 100% parity between the frontend preview and the generated PDF
 */

const { logger } = require('../utils/logger');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Try to load puppeteer
let puppeteer = null;

try {
    puppeteer = require('puppeteer');
    logger.info('Puppeteer loaded - PDF generation enabled');
} catch (e) {
    logger.warn('Puppeteer not available - PDF generation will be disabled');
    logger.warn('Error:', e.message);
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
function formatDate(dateInput) {
    if (!dateInput) return '';
    
    let date;
    
    // Handle Date objects
    if (dateInput instanceof Date) {
        date = dateInput;
    } else {
        // Convert to string if needed
        const dateStr = String(dateInput);
        
        // Handle ISO strings and YYYY-MM-DD format
        if (dateStr.includes('T')) {
            // For ISO strings, extract just the date part to avoid timezone shifts
            const datePart = dateStr.split('T')[0];
            const [year, month, day] = datePart.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else if (dateStr.includes('-')) {
            const [year, month, day] = dateStr.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else {
            // Fallback: try to parse as-is
            date = new Date(dateStr);
        }
    }
    
    // Check for invalid date
    if (isNaN(date.getTime())) {
        return '';
    }
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Convert image URL to base64 data URL for reliable PDF embedding
 * This ensures Puppeteer can always load the image
 */
async function convertImageToDataUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // If already a data URL, return as-is
    if (imageUrl.startsWith('data:')) {
        return imageUrl;
    }
    
    try {
        // Normalize URL
        let url = imageUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.startsWith('/uploads/')) {
                const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
                url = `${baseUrl}${url}`;
            } else if (url.includes('.s3.') && !url.startsWith('http')) {
                url = `https://${url}`;
            } else {
                return url; // Return as-is if we can't normalize
            }
        }
        
        logger.info(`Fetching image for PDF: ${url}`);
        
        // Fetch image and convert to base64
        const imageBuffer = await new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to fetch image: ${response.statusCode}`));
                    return;
                }
                
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
            }).on('error', reject);
        });
        
        // Determine content type from URL or response
        let contentType = 'image/png'; // default
        if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
        else if (url.includes('.gif')) contentType = 'image/gif';
        else if (url.includes('.webp')) contentType = 'image/webp';
        
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        logger.info(`Image converted to data URL, size: ${base64.length} chars`);
        return dataUrl;
    } catch (error) {
        logger.warn(`Failed to convert image to data URL: ${error.message}, using original URL`);
        return imageUrl; // Fallback to original URL
    }
}

/**
 * Normalize logo URL to absolute URL for Puppeteer
 * Converts relative paths to absolute URLs
 */
function normalizeLogoUrl(logoUrl) {
    if (!logoUrl) return null;
    
    // If already absolute URL (http/https), return as-is
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        return logoUrl;
    }
    
    // If relative path starting with /uploads/, convert to absolute URL
    if (logoUrl.startsWith('/uploads/')) {
        // Use API_URL or FRONTEND_URL from environment, fallback to localhost
        const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
        return `${baseUrl}${logoUrl}`;
    }
    
    // If it's an S3 URL without protocol (shouldn't happen, but handle it)
    if (logoUrl.includes('.s3.') && !logoUrl.startsWith('http')) {
        return `https://${logoUrl}`;
    }
    
    // Return as-is for other cases
    return logoUrl;
}

/**
 * Load itemize.cloud logo for footer
 * Returns base64 data URL of the logo
 * Caches the result to avoid reading file multiple times
 */
let cachedLogoDataUrl = null;
let cachedIconDataUrl = null;
let cachedTextWhiteDataUrl = null;
let cachedTextBlackDataUrl = null;

function getItemizeLogo() {
    // Return cached version if available
    if (cachedLogoDataUrl !== null) {
        return cachedLogoDataUrl;
    }
    
    try {
        // Try to load from frontend public directory (local development)
        const logoPath = path.join(__dirname, '../../frontend/public/cover.png');
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            const base64 = logoBuffer.toString('base64');
            cachedLogoDataUrl = `data:image/png;base64,${base64}`;
            logger.info('Itemize logo loaded from local file');
            return cachedLogoDataUrl;
        }
        
        // Fallback: try relative to backend
        const altPath = path.join(__dirname, '../public/cover.png');
        if (fs.existsSync(altPath)) {
            const logoBuffer = fs.readFileSync(altPath);
            const base64 = logoBuffer.toString('base64');
            cachedLogoDataUrl = `data:image/png;base64,${base64}`;
            logger.info('Itemize logo loaded from backend public directory');
            return cachedLogoDataUrl;
        }
        
        // In production (Railway), we might need to fetch from URL
        // For now, return null and use text fallback
        logger.warn('Itemize logo not found locally, footer will be text-only');
        cachedLogoDataUrl = false; // Cache false to avoid repeated checks
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize logo: ${error.message}`);
        cachedLogoDataUrl = false;
        return null;
    }
}

async function getItemizeIconAsync() {
    // Return cached version if available
    if (cachedIconDataUrl !== null && cachedIconDataUrl !== false) {
        return cachedIconDataUrl;
    }
    
    try {
        // Try multiple possible paths
        const possiblePaths = [
            path.join(__dirname, '../../frontend/public/icon.png'),
            path.join(__dirname, '../../../frontend/public/icon.png'),
            path.join(__dirname, '../public/icon.png'),
            path.join(process.cwd(), 'frontend/public/icon.png'),
            path.join(process.cwd(), 'public/icon.png')
        ];
        
        for (const iconPath of possiblePaths) {
            if (fs.existsSync(iconPath)) {
                const iconBuffer = fs.readFileSync(iconPath);
                const base64 = iconBuffer.toString('base64');
                cachedIconDataUrl = `data:image/png;base64,${base64}`;
                logger.info(`Itemize icon loaded from filesystem: ${iconPath}`);
                return cachedIconDataUrl;
            }
        }
        
        // Fallback: try to fetch via HTTP (for production environments)
        const baseUrl = process.env.FRONTEND_URL || process.env.API_URL || 'http://localhost:5173';
        const httpUrl = `${baseUrl}/icon.png`;
        logger.info(`Trying to fetch itemize icon via HTTP: ${httpUrl}`);
        const iconDataUrl = await convertImageToDataUrl(httpUrl);
        if (iconDataUrl && iconDataUrl.startsWith('data:')) {
            cachedIconDataUrl = iconDataUrl;
            logger.info('Itemize icon loaded via HTTP');
            return cachedIconDataUrl;
        }
        
        logger.warn('Itemize icon not found in any expected location');
        cachedIconDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize icon: ${error.message}`);
        logger.warn(`Error stack: ${error.stack}`);
        cachedIconDataUrl = false;
        return null;
    }
}

function getItemizeIcon() {
    // Synchronous version for backward compatibility
    // This will only work if already cached
    if (cachedIconDataUrl !== null && cachedIconDataUrl !== false) {
        return cachedIconDataUrl;
    }
    // If not cached, return null (will be loaded async)
    return null;
}

function getItemizeTextWhite() {
    // Return cached version if available
    if (cachedTextWhiteDataUrl !== null) {
        return cachedTextWhiteDataUrl;
    }
    
    try {
        // Try to load from frontend public directory (local development)
        const textPath = path.join(__dirname, '../../frontend/public/textwhite.png');
        if (fs.existsSync(textPath)) {
            const textBuffer = fs.readFileSync(textPath);
            const base64 = textBuffer.toString('base64');
            cachedTextWhiteDataUrl = `data:image/png;base64,${base64}`;
            return cachedTextWhiteDataUrl;
        }
        
        // Fallback: try relative to backend
        const altPath = path.join(__dirname, '../public/textwhite.png');
        if (fs.existsSync(altPath)) {
            const textBuffer = fs.readFileSync(altPath);
            const base64 = textBuffer.toString('base64');
            cachedTextWhiteDataUrl = `data:image/png;base64,${base64}`;
            return cachedTextWhiteDataUrl;
        }
        
        cachedTextWhiteDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize text white: ${error.message}`);
        cachedTextWhiteDataUrl = false;
        return null;
    }
}

async function getItemizeTextBlackAsync() {
    // Return cached version if available
    if (cachedTextBlackDataUrl !== null && cachedTextBlackDataUrl !== false) {
        return cachedTextBlackDataUrl;
    }
    
    try {
        // Try multiple possible paths
        const possiblePaths = [
            path.join(__dirname, '../../frontend/public/textblack.png'),
            path.join(__dirname, '../../../frontend/public/textblack.png'),
            path.join(__dirname, '../public/textblack.png'),
            path.join(process.cwd(), 'frontend/public/textblack.png'),
            path.join(process.cwd(), 'public/textblack.png')
        ];
        
        for (const textPath of possiblePaths) {
            if (fs.existsSync(textPath)) {
                const textBuffer = fs.readFileSync(textPath);
                const base64 = textBuffer.toString('base64');
                cachedTextBlackDataUrl = `data:image/png;base64,${base64}`;
                logger.info(`Itemize text black loaded from filesystem: ${textPath}`);
                return cachedTextBlackDataUrl;
            }
        }
        
        // Fallback: try to fetch via HTTP (for production environments)
        const baseUrl = process.env.FRONTEND_URL || process.env.API_URL || 'http://localhost:5173';
        const httpUrl = `${baseUrl}/textblack.png`;
        logger.info(`Trying to fetch itemize text black via HTTP: ${httpUrl}`);
        const textDataUrl = await convertImageToDataUrl(httpUrl);
        if (textDataUrl && textDataUrl.startsWith('data:')) {
            cachedTextBlackDataUrl = textDataUrl;
            logger.info('Itemize text black loaded via HTTP');
            return cachedTextBlackDataUrl;
        }
        
        logger.warn('Itemize text black not found in any expected location');
        cachedTextBlackDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize text black: ${error.message}`);
        logger.warn(`Error stack: ${error.stack}`);
        cachedTextBlackDataUrl = false;
        return null;
    }
}

function getItemizeTextBlack() {
    // Synchronous version for backward compatibility
    // This will only work if already cached
    if (cachedTextBlackDataUrl !== null && cachedTextBlackDataUrl !== false) {
        return cachedTextBlackDataUrl;
    }
    // If not cached, return null (will be loaded async)
    return null;
}

/**
 * Generate invoice HTML template
 * This is the EXACT same layout as the frontend InvoicePreview component
 * Any changes here should be mirrored in the frontend preview
 */
async function generateInvoiceHTML(invoice, settings = {}) {
    const business = invoice.business || {
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

    // Load itemize logos for footer (baked into template)
    // Try to load them asynchronously (will fallback to HTTP if filesystem fails)
    const iconDataUrl = await getItemizeIconAsync();
    const textDataUrl = await getItemizeTextBlackAsync();
    logger.info(`Itemize logos - Icon: ${iconDataUrl ? 'loaded' : 'missing'}, Text: ${textDataUrl ? 'loaded' : 'missing'}`);

    const currency = invoice.currency || 'USD';

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
                .powered-by-footer {
                    margin-top: auto;
                    margin-left: -40px;
                    margin-right: -40px;
                    margin-bottom: 0;
                    padding: 16px 24px;
                    background-color: #2563eb;
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
                .paid-amount {
                    color: #059669;
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
                    <div class="invoice-title">
                        <h1>INVOICE</h1>
                        ${invoice.invoice_number ? `<div class="invoice-number">${escapeHtml(invoice.invoice_number)}</div>` : ''}
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
    if (!puppeteer) {
        throw new Error('PDF generation not available - puppeteer not installed');
    }

    let browser = null;
    
    try {
        logger.info('Launching Puppeteer browser for PDF generation...');
        
        // Get Chrome path from environment (set by Dockerfile)
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        if (executablePath) {
            logger.info(`Using Chrome from: ${executablePath}`);
        }
        
        // Launch browser with args optimized for Docker/Railway
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        };
        
        // Use system Chrome if path is provided
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }
        
        browser = await puppeteer.launch(launchOptions);

        logger.info('Browser launched, creating page...');
        const page = await browser.newPage();
        
        // Set content and wait for everything to load
        await page.setContent(html, { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 30000
        });

        // Wait for fonts to load (including Raleway from Google Fonts)
        await page.evaluate(() => {
            return document.fonts.ready.then(() => {
                // Additional check to ensure Raleway is loaded
                const ralewayLoaded = document.fonts.check('1em Raleway');
                if (!ralewayLoaded) {
                    console.warn('Raleway font may not be loaded yet');
                }
                return Promise.resolve();
            });
        });
        
        // Wait for all images to load
        await page.evaluate(() => {
            return Promise.all(
                Array.from(document.images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = () => {
                            console.warn('Image failed to load:', img.src);
                            resolve(); // Resolve anyway to continue
                        };
                        // Timeout after 5 seconds
                        setTimeout(() => {
                            console.warn('Image load timeout:', img.src);
                            resolve();
                        }, 5000);
                    });
                })
            );
        });
        
        // Small delay to ensure fonts and images are fully rendered
        await new Promise(resolve => setTimeout(resolve, 1000));

        logger.info('Page content set, generating PDF...');
        
        // Generate PDF - Letter format (8.5x11 inches)
        const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '15mm',
                right: '15mm',
                bottom: '15mm',
                left: '15mm'
            }
        });

        logger.info(`PDF generated successfully, size: ${pdf.length} bytes`);
        return Buffer.from(pdf);
    } catch (error) {
        logger.error('Error in generatePDF:', error);
        logger.error('Stack trace:', error.stack);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            logger.info('Browser closed');
        }
    }
}

/**
 * Generate invoice PDF
 */
async function generateInvoicePDF(invoice, settings = {}) {
    logger.info(`Generating PDF for invoice: ${invoice.invoice_number}`);
    
    // Log logo URL info for debugging
    const businessLogoUrl = invoice.business?.logo_url;
    const settingsLogoUrl = settings.logo_url;
    logger.info(`Logo URL - Business: ${businessLogoUrl || 'none'}, Settings: ${settingsLogoUrl || 'none'}`);
    
    const html = await generateInvoiceHTML(invoice, settings);
    return generatePDF(html);
}

/**
 * Check if PDF generation is available
 */
function isPDFAvailable() {
    return puppeteer !== null;
}

/**
 * Generate estimate HTML template
 * This is EXACT same layout as frontend EstimatePreview component
 * Any changes here should be mirrored in frontend preview
 */
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
async function generateEstimatePDF(estimate, settings = {}) {
    logger.info(`Generating PDF for estimate: ${estimate.estimate_number}`);
    
    const html = await generateEstimateHTML(estimate, settings);
    return generatePDF(html);
}

/**
 * Check if PDF generation is available
 */
function isEstimatePDFAvailable() {
    return puppeteer !== null;
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
