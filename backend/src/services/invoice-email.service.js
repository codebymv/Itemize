/**
 * Invoice Email Service
 * Send invoice-related emails
 */

const { logger } = require('../utils/logger');
const { wrapInBrandedTemplate } = require('./email-template.service');

// Email templates - using table-based layout for email client compatibility
const EMAIL_TEMPLATES = {
    invoiceSent: {
        subject: 'Invoice {invoice_number} from {business_name}',
        html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #f9fafb;">
                    <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
                            Hi {customer_name},
                        </p>
                        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
                            Please find attached invoice {invoice_number}. Payment is due by {due_date}.
                        </p>
                        {payment_link_section}
                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px; margin-bottom: 0;">
                            Best regards,<br>
                            {business_name}
                        </p>
                    </div>
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        {business_email}
                    </p>
                </div>
            </div>
        `
    },
    paymentReceived: {
        subject: 'Payment Received - Invoice {invoice_number}',
        html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #f9fafb;">
                    <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 24px;">
                            <div style="width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; margin: 0 auto 16px; line-height: 64px; text-align: center;">
                                <span style="font-size: 32px;">✓</span>
                            </div>
                            <h1 style="font-size: 24px; margin: 0; color: #111827;">
                                Payment Received
                            </h1>
                        </div>
                        
                        <p style="color: #6b7280; margin: 0 0 24px; text-align: center;">
                            Thank you for your payment, {customer_name}!
                        </p>
                        
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
                            <tr>
                                <td style="padding: 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="color: #6b7280; padding-bottom: 8px;">Invoice:</td>
                                            <td style="text-align: right; color: #111827; padding-bottom: 8px;">{invoice_number}</td>
                                        </tr>
                                        <tr>
                                            <td style="color: #6b7280; padding-bottom: 8px;">Amount Paid:</td>
                                            <td style="text-align: right; font-weight: 600; color: #059669; padding-bottom: 8px;">{amount_paid}</td>
                                        </tr>
                                        <tr>
                                            <td style="color: #6b7280;">Payment Date:</td>
                                            <td style="text-align: right; color: #111827;">{payment_date}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="color: #6b7280; font-size: 14px; text-align: center;">
                            A receipt has been attached to this email for your records.
                        </p>
                    </div>
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        {business_name} • {business_email}
                    </p>
                </div>
            </div>
        `
    },
    paymentReminder: {
        subject: 'Payment Reminder - Invoice {invoice_number}',
        html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #f9fafb;">
                    <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <h1 style="font-size: 24px; margin: 0 0 16px; color: #111827;">
                            Payment Reminder
                        </h1>
                        <p style="color: #6b7280; margin: 0 0 24px;">
                            Hi {customer_name},
                        </p>
                        <p style="color: #374151; margin: 0 0 24px;">
                            This is a friendly reminder that invoice {invoice_number} {reminder_text}.
                        </p>
                        
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: {reminder_bg}; border-radius: 8px; margin-bottom: 24px;">
                            <tr>
                                <td style="padding: 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="color: #6b7280; padding-bottom: 12px;">Amount Due:</td>
                                            <td style="text-align: right; font-weight: 600; font-size: 20px; color: #111827; padding-bottom: 12px;">{amount_due}</td>
                                        </tr>
                                        <tr>
                                            <td style="color: #6b7280;">Due Date:</td>
                                            <td style="text-align: right; color: {due_date_color}; font-weight: 500;">{due_date}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        {payment_link_section}

                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                            If you've already sent your payment, please disregard this reminder.
                        </p>
                    </div>
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        {business_name} • {business_email}
                    </p>
                </div>
            </div>
        `
    },
    estimateSent: {
        subject: 'Estimate {estimate_number} from {business_name}',
        html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #f9fafb;">
                    <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <h1 style="font-size: 24px; margin: 0 0 16px; color: #111827;">
                            Estimate {estimate_number}
                        </h1>
                        <p style="color: #6b7280; margin: 0 0 24px;">
                            Hi {customer_name},
                        </p>
                        <p style="color: #374151; margin: 0 0 24px;">
                            Please find attached your estimate from {business_name}.
                        </p>
                        
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
                            <tr>
                                <td style="padding: 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="color: #6b7280; padding-bottom: 12px;">Estimated Total:</td>
                                            <td style="text-align: right; font-weight: 600; font-size: 20px; color: #111827; padding-bottom: 12px;">{total}</td>
                                        </tr>
                                        <tr>
                                            <td style="color: #6b7280;">Valid Until:</td>
                                            <td style="text-align: right; color: #111827;">{valid_until}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                            If you have any questions or would like to proceed, please don't hesitate to contact us.
                        </p>
                        
                        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px; font-style: italic;">
                            📎 Estimate PDF attached
                        </p>
                    </div>
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        {business_name} • {business_email}
                    </p>
                </div>
            </div>
        `
    }
};

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
 * Replace template variables
 */
function applyTemplate(template, variables) {
    let result = { ...template };
    
    // Replace in subject
    Object.keys(variables).forEach(key => {
        result.subject = result.subject.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key] || '');
    });
    
    // Replace in html
    Object.keys(variables).forEach(key => {
        result.html = result.html.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key] || '');
    });
    
    return result;
}

/**
 * Send invoice email with optional PDF attachment
 * @param {Object} emailService - The email service instance
 * @param {Object} invoice - The invoice data
 * @param {Object} settings - Payment settings with business info
 * @param {string|null} paymentUrl - Optional payment URL
 * @param {Buffer|null} pdfBuffer - Optional PDF buffer to attach
 * @param {Object} options - Additional options (cc, customSubject, customMessage)
 */
async function sendInvoiceEmail(emailService, invoice, settings, paymentUrl = null, pdfBuffer = null, options = {}) {
    if (!emailService || !invoice.customer_email) {
        logger.warn('Cannot send invoice email - no email service or customer email');
        return false;
    }

    const { cc, customSubject, customMessage } = options;

    const paymentLinkSection = paymentUrl ? `
        <div style="text-align: center; margin: 24px 0;">
            <a href="${paymentUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                Pay Now
            </a>
        </div>
    ` : '';

    // Check if customMessage is provided and not just whitespace
    const hasCustomMessage = customMessage && customMessage.trim().length > 0;
    
    // Build the email body content
    let bodyContent;
    let subject;
    
    if (hasCustomMessage) {
        // Custom message from user
        subject = customSubject || `Invoice ${invoice.invoice_number} from ${settings.business_name || 'Our Company'}`;
        bodyContent = `
            <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">${customMessage.trim()}</div>
            ${paymentLinkSection}
        `;
    } else {
        // Default template - simplified since PDF has all the details
        subject = customSubject || `Invoice ${invoice.invoice_number} from ${settings.business_name || 'Our Company'}`;
        bodyContent = `
            <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
                Hi ${invoice.customer_name || 'Valued Customer'},
            </p>
            <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
                Please find attached invoice ${invoice.invoice_number}. Payment is due by ${formatDate(invoice.due_date)}.
            </p>
            ${paymentLinkSection}
            <p style="color: #6b7280; font-size: 14px; margin-top: 24px; margin-bottom: 0;">
                Best regards,<br>
                ${settings.business_name || 'Our Company'}
            </p>
        `;
    }

    // Wrap in branded template (with Itemize logo header and footer)
    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false // Transactional emails don't need unsubscribe
    });

    try {
        const emailOptions = {
            to: invoice.customer_email,
            subject,
            html
        };

        // Add CC recipients if provided
        if (cc && cc.length > 0) {
            emailOptions.cc = cc;
        }

        // Add PDF attachment if provided
        if (pdfBuffer) {
            emailOptions.attachments = [
                {
                    filename: `${invoice.invoice_number}.pdf`,
                    content: pdfBuffer
                }
            ];
        }

        await emailService.sendEmail(emailOptions);
        logger.info(`Invoice email sent to ${invoice.customer_email} for invoice ${invoice.invoice_number}${pdfBuffer ? ' with PDF attachment' : ''}`);
        return true;
    } catch (error) {
        logger.error('Failed to send invoice email:', error);
        return false;
    }
}

/**
 * Send payment received email
 */
async function sendPaymentReceivedEmail(emailService, invoice, payment, settings) {
    if (!emailService || !invoice.customer_email) {
        return false;
    }

    const subject = `Payment Received - Invoice ${invoice.invoice_number}`;
    
    // Build payment received content
    const bodyContent = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; margin: 0 auto 16px; line-height: 64px; text-align: center;">
                <span style="font-size: 32px;">✓</span>
            </div>
            <h1 style="font-size: 24px; margin: 0; color: #111827;">
                Payment Received
            </h1>
        </div>
        
        <p style="color: #6b7280; margin: 0 0 24px; text-align: center;">
            Thank you for your payment, ${invoice.customer_name || 'Valued Customer'}!
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
            <tr>
                <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #6b7280; padding-bottom: 8px;">Invoice:</td>
                            <td style="text-align: right; color: #111827; padding-bottom: 8px;">${invoice.invoice_number}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280; padding-bottom: 8px;">Amount Paid:</td>
                            <td style="text-align: right; font-weight: 600; color: #059669; padding-bottom: 8px;">${formatCurrency(payment.amount, invoice.currency)}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280;">Payment Date:</td>
                            <td style="text-align: right; color: #111827;">${formatDate(payment.paid_at || payment.created_at)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <p style="color: #6b7280; font-size: 14px; text-align: center;">
            A receipt has been attached to this email for your records.
        </p>
    `;

    // Wrap in branded template
    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({
            to: invoice.customer_email,
            subject,
            html
        });
        logger.info(`Payment confirmation email sent to ${invoice.customer_email}`);
        return true;
    } catch (error) {
        logger.error('Failed to send payment confirmation email:', error);
        return false;
    }
}

/**
 * Send payment reminder email
 */
async function sendPaymentReminderEmail(emailService, invoice, settings, isOverdue = false, paymentUrl = null) {
    if (!emailService || !invoice.customer_email) {
        return false;
    }

    const paymentLinkSection = paymentUrl ? `
        <div style="text-align: center; margin: 24px 0;">
            <a href="${paymentUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                Pay Now
            </a>
        </div>
    ` : '';

    const daysOverdue = isOverdue 
        ? Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24))
        : 0;

    const reminderText = isOverdue 
        ? `is now ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
        : 'is due soon';
    const reminderBg = isOverdue ? '#fee2e2' : '#fef3c7';
    const dueDateColor = isOverdue ? '#dc2626' : '#d97706';

    const subject = `Payment Reminder - Invoice ${invoice.invoice_number}`;
    
    const bodyContent = `
        <h1 style="font-size: 24px; margin: 0 0 16px; color: #111827;">
            Payment Reminder
        </h1>
        <p style="color: #6b7280; margin: 0 0 24px;">
            Hi ${invoice.customer_name || 'Valued Customer'},
        </p>
        <p style="color: #374151; margin: 0 0 24px;">
            This is a friendly reminder that invoice ${invoice.invoice_number} ${reminderText}.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: ${reminderBg}; border-radius: 8px; margin-bottom: 24px;">
            <tr>
                <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #6b7280; padding-bottom: 12px;">Amount Due:</td>
                            <td style="text-align: right; font-weight: 600; font-size: 20px; color: #111827; padding-bottom: 12px;">${formatCurrency(invoice.amount_due, invoice.currency)}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280;">Due Date:</td>
                            <td style="text-align: right; color: ${dueDateColor}; font-weight: 500;">${formatDate(invoice.due_date)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        ${paymentLinkSection}

        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            If you've already sent your payment, please disregard this reminder.
        </p>
    `;

    // Wrap in branded template
    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({
            to: invoice.customer_email,
            subject,
            html
        });
        logger.info(`Payment reminder email sent to ${invoice.customer_email} for invoice ${invoice.invoice_number}`);
        return true;
    } catch (error) {
        logger.error('Failed to send payment reminder email:', error);
        return false;
    }
}

/**
 * Send estimate email
 */
async function sendEstimateEmail(emailService, estimate, settings) {
    if (!emailService || !estimate.customer_email) {
        return false;
    }

    const subject = `Estimate ${estimate.estimate_number} from ${settings.business_name || 'Our Company'}`;
    
    const bodyContent = `
        <h1 style="font-size: 24px; margin: 0 0 16px; color: #111827;">
            Estimate ${estimate.estimate_number}
        </h1>
        <p style="color: #6b7280; margin: 0 0 24px;">
            Hi ${estimate.customer_name || 'Valued Customer'},
        </p>
        <p style="color: #374151; margin: 0 0 24px;">
            Please find attached your estimate from ${settings.business_name || 'Our Company'}.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
            <tr>
                <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #6b7280; padding-bottom: 12px;">Estimated Total:</td>
                            <td style="text-align: right; font-weight: 600; font-size: 20px; color: #111827; padding-bottom: 12px;">${formatCurrency(estimate.total, estimate.currency)}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280;">Valid Until:</td>
                            <td style="text-align: right; color: #111827;">${formatDate(estimate.valid_until)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            If you have any questions or would like to proceed, please don't hesitate to contact us.
        </p>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px; font-style: italic;">
            📎 Estimate PDF attached
        </p>
    `;

    // Wrap in branded template
    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({
            to: estimate.customer_email,
            subject,
            html
        });
        logger.info(`Estimate email sent to ${estimate.customer_email} for estimate ${estimate.estimate_number}`);
        return true;
    } catch (error) {
        logger.error('Failed to send estimate email:', error);
        return false;
    }
}

module.exports = {
    sendInvoiceEmail,
    sendPaymentReceivedEmail,
    sendPaymentReminderEmail,
    sendEstimateEmail,
    EMAIL_TEMPLATES
};
