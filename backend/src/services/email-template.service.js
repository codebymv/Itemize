/**
 * Email Template Service
 * Handles template variable replacement and email branding
 */

const { logger } = require('../utils/logger');

// CSS class to inline style mapping for email compatibility
const CSS_CLASS_STYLES = {
    // Buttons
    'button-primary': `
        display: inline-block;
        background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
        color: white !important;
        padding: 14px 28px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin: 10px 0;
    `.replace(/\s+/g, ' ').trim(),
    'button-secondary': `
        display: inline-block;
        background-color: #f1f5f9;
        color: #475569 !important;
        padding: 14px 28px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin: 10px 0;
    `.replace(/\s+/g, ' ').trim(),

    // Callouts
    'callout-info': `
        background-color: #eff6ff;
        border-left: 4px solid #2563eb;
        padding: 16px 20px;
        border-radius: 0 8px 8px 0;
        margin: 20px 0;
    `.replace(/\s+/g, ' ').trim(),
    'callout-success': `
        background-color: #f0fdf4;
        border-left: 4px solid #22c55e;
        padding: 16px 20px;
        border-radius: 0 8px 8px 0;
        margin: 20px 0;
    `.replace(/\s+/g, ' ').trim(),
    'callout-warning': `
        background-color: #fefce8;
        border-left: 4px solid #eab308;
        padding: 16px 20px;
        border-radius: 0 8px 8px 0;
        margin: 20px 0;
    `.replace(/\s+/g, ' ').trim(),
    'callout-error': `
        background-color: #fef2f2;
        border-left: 4px solid #ef4444;
        padding: 16px 20px;
        border-radius: 0 8px 8px 0;
        margin: 20px 0;
    `.replace(/\s+/g, ' ').trim(),
    'callout-slate': `
        background-color: #f1f5f9;
        border-left: 4px solid #64748b;
        padding: 16px 20px;
        border-radius: 0 8px 8px 0;
        margin: 20px 0;
    `.replace(/\s+/g, ' ').trim(),

    // Badges
    'badge-blue': `
        display: inline-block;
        background-color: #dbeafe;
        color: #1e40af;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    `.replace(/\s+/g, ' ').trim(),
    'badge-green': `
        display: inline-block;
        background-color: #dcfce7;
        color: #166534;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    `.replace(/\s+/g, ' ').trim(),
    'badge-yellow': `
        display: inline-block;
        background-color: #fef3c7;
        color: #92400e;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    `.replace(/\s+/g, ' ').trim(),
    'badge-red': `
        display: inline-block;
        background-color: #fee2e2;
        color: #991b1b;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    `.replace(/\s+/g, ' ').trim(),
    'badge-slate': `
        display: inline-block;
        background-color: #e2e8f0;
        color: #475569;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    `.replace(/\s+/g, ' ').trim(),

    // Text styles
    'text-center': 'text-align: center;',
    'text-left': 'text-align: left;',
    'text-right': 'text-align: right;',
    'text-muted': 'color: #64748b;',
    'text-small': 'font-size: 13px;',
    'text-large': 'font-size: 18px;',
};

/**
 * Replace template variables with values
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {object} data - Key-value pairs for replacement
 * @returns {string} - Template with replaced values
 */
function replaceVariables(template, data) {
    if (!template) return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        // Support nested keys like contact.first_name
        const keys = key.split('.');
        let value = data;

        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) break;
        }

        return value !== undefined ? String(value) : match;
    });
}

/**
 * Extract variable names from a template
 * @param {string} template - Template string
 * @returns {string[]} - Array of unique variable names
 */
function extractVariables(template) {
    if (!template) return [];
    const matches = template.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Transform CSS classes to inline styles
 * @param {string} html - HTML content with class attributes
 * @returns {string} - HTML with inline styles
 */
function transformCssToInline(html) {
    if (!html) return html;

    let result = html;

    // Find all class="..." attributes and convert to inline styles
    Object.entries(CSS_CLASS_STYLES).forEach(([className, inlineStyle]) => {
        // Match class="className" or class="... className ..."
        const classRegex = new RegExp(`class="([^"]*\\b${className}\\b[^"]*)"`, 'gi');

        result = result.replace(classRegex, (match, classes) => {
            // Keep the class attribute but also add style
            return `class="${classes}" style="${inlineStyle}"`;
        });
    });

    return result;
}

/**
 * Get default template variables with sample values
 * @param {object} recipient - Optional recipient data
 * @returns {object} - Template variables
 */
function getDefaultVariables(recipient = {}) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    return {
        userName: recipient.name || recipient.email?.split('@')[0] || 'User',
        userEmail: recipient.email || 'user@example.com',
        dashboardUrl: `${frontendUrl}/dashboard`,
        billingUrl: `${frontendUrl}/settings/account`,
        unsubscribeUrl: `${frontendUrl}/unsubscribe`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@itemize.cloud',
        currentYear: new Date().getFullYear().toString(),
    };
}

// Logo URL - for previews use FRONTEND_URL, for actual emails use production URL
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PROD_URL = process.env.PROD_URL || 'https://itemize.cloud';
// Use frontend URL for development previews, production URL for actual emails
const getLogoUrl = (isPreview = false) => {
    // For previews during development, use frontend URL so the image loads
    if (isPreview && FRONTEND_URL.includes('localhost')) {
        return `${FRONTEND_URL}/cover.png`;
    }
    // For production or actual emails, use production URL
    return `${PROD_URL}/cover.png`;
};

/**
 * Wrap content in branded email template
 * @param {string} bodyHtml - Email body content
 * @param {object} options - Options (subject, showHeader, showFooter, isPreview, showUnsubscribe)
 * @returns {string} - Complete HTML email
 */
function wrapInBrandedTemplate(bodyHtml, options = {}) {
    const { 
        subject = 'Itemize', 
        showHeader = true, 
        showFooter = true, 
        isPreview = false,
        showUnsubscribe = true // Set to false for transactional emails (invoices, receipts, etc.)
    } = options;

    // If content already looks like a complete HTML document, return as-is
    if (bodyHtml.toLowerCase().includes('<!doctype') || bodyHtml.toLowerCase().includes('<html')) {
        return bodyHtml;
    }

    // Transform CSS classes to inline styles
    const styledBody = transformCssToInline(bodyHtml);
    const logoUrl = getLogoUrl(isPreview);

    // Header with logo image
    const header = showHeader ? `
        <div style="text-align: center; padding: 20px; background: #ffffff; border-radius: 12px 12px 0 0;">
            <a href="${FRONTEND_URL}" target="_blank" style="text-decoration: none;">
                <img 
                    src="${logoUrl}" 
                    alt="Itemize" 
                    width="200" 
                    style="display: block; margin: 0 auto; max-width: 200px; height: auto; border: 0; outline: none;"
                />
            </a>
        </div>
    ` : '';

    // Footer links - conditionally include unsubscribe for non-transactional emails
    const footerLinks = showUnsubscribe
        ? `<a href="{{unsubscribeUrl}}" style="color: #2563eb; text-decoration: none;">Unsubscribe</a> · 
           <a href="${FRONTEND_URL}" style="color: #2563eb; text-decoration: none;">Visit Website</a>`
        : `<a href="${FRONTEND_URL}" style="color: #2563eb; text-decoration: none;">Visit Website</a>`;

    const footer = showFooter ? `
        <div style="text-align: center; padding: 30px 20px; color: #64748b; font-size: 13px;">
            <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} Itemize. All rights reserved.</p>
            <p style="margin: 0;">
                ${footerLinks}
            </p>
        </div>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${subject}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        a { color: #2563eb; }
        img { max-width: 100%; height: auto; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 10px !important; }
            .email-body { padding: 20px !important; }
        }
    </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #1e293b; background-color: #ffffff; margin: 0; padding: 0;">
    <div class="email-wrapper" style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${header}
        <div class="email-body" style="background-color: #ffffff; padding: 40px 30px; ${showHeader ? 'border-radius: 0 0 12px 12px;' : 'border-radius: 12px;'} box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            ${styledBody}
        </div>
        ${footer}
    </div>
</body>
</html>
    `.trim();
}

/**
 * Process a template with recipient data
 * @param {object} template - Template object with subject and body_html
 * @param {object} recipient - Recipient data (email, name, etc.)
 * @param {object} additionalData - Additional template variables
 * @returns {object} - Processed subject and html
 */
function processTemplate(template, recipient = {}, additionalData = {}) {
    const variables = {
        ...getDefaultVariables(recipient),
        ...additionalData,
    };

    const subject = replaceVariables(template.subject, variables);
    let html = replaceVariables(template.body_html, variables);

    // Wrap in branded template
    html = wrapInBrandedTemplate(html, { subject });

    // Final variable replacement (for footer variables)
    html = replaceVariables(html, variables);

    return { subject, html };
}

module.exports = {
    replaceVariables,
    extractVariables,
    transformCssToInline,
    getDefaultVariables,
    wrapInBrandedTemplate,
    processTemplate,
    CSS_CLASS_STYLES,
};
