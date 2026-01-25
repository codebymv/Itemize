/**
 * Invoice Email Service
 * Send invoice-related emails
 */

const { logger } = require('../utils/logger');

// Email templates
const EMAIL_TEMPLATES = {
    invoiceSent: {
        subject: 'Invoice {invoice_number} from {business_name}',
        html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #f9fafb;">
                    <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <h1 style="font-size: 24px; margin: 0 0 16px; color: #111827;">
                            Invoice {invoice_number}
                        </h1>
                        <p style="color: #6b7280; margin: 0 0 24px;">
                            Hi {customer_name},
                        </p>
                        <p style="color: #374151; margin: 0 0 24px;">
                            Please find attached your invoice from {business_name}.
                        </p>
                        
                        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #6b7280;">Amount Due:</span>
                                <span style="font-weight: 600; font-size: 20px; color: #111827;">{amount_due}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Due Date:</span>
                                <span style="color: #111827;">{due_date}</span>
                            </div>
                        </div>

                        {payment_link_section}

                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                            If you have any questions about this invoice, please don't hesitate to contact us.
                        </p>
                    </div>
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        {business_name} • {business_email}
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
                            <div style="width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                                <svg width="32" height="32" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24">
                                    <path d="M20 6L9 17l-5-5"/>
                                </svg>
                            </div>
                            <h1 style="font-size: 24px; margin: 0; color: #111827;">
                                Payment Received
                            </h1>
                        </div>
                        
                        <p style="color: #6b7280; margin: 0 0 24px; text-align: center;">
                            Thank you for your payment, {customer_name}!
                        </p>
                        
                        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #6b7280;">Invoice:</span>
                                <span style="color: #111827;">{invoice_number}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #6b7280;">Amount Paid:</span>
                                <span style="font-weight: 600; color: #059669;">{amount_paid}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Payment Date:</span>
                                <span style="color: #111827;">{payment_date}</span>
                            </div>
                        </div>

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
                        
                        <div style="background: {reminder_bg}; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #6b7280;">Amount Due:</span>
                                <span style="font-weight: 600; font-size: 20px; color: #111827;">{amount_due}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Due Date:</span>
                                <span style="color: {due_date_color}; font-weight: 500;">{due_date}</span>
                            </div>
                        </div>

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
                        
                        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #6b7280;">Estimated Total:</span>
                                <span style="font-weight: 600; font-size: 20px; color: #111827;">{total}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Valid Until:</span>
                                <span style="color: #111827;">{valid_until}</span>
                            </div>
                        </div>

                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                            If you have any questions or would like to proceed, please don't hesitate to contact us.
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
 * Send invoice email
 */
async function sendInvoiceEmail(emailService, invoice, settings, paymentUrl = null) {
    if (!emailService || !invoice.customer_email) {
        logger.warn('Cannot send invoice email - no email service or customer email');
        return false;
    }

    const paymentLinkSection = paymentUrl ? `
        <div style="text-align: center; margin: 24px 0;">
            <a href="${paymentUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                Pay Now
            </a>
        </div>
    ` : '';

    const template = applyTemplate(EMAIL_TEMPLATES.invoiceSent, {
        invoice_number: invoice.invoice_number,
        business_name: settings.business_name || 'Our Company',
        business_email: settings.business_email || '',
        customer_name: invoice.customer_name || 'Valued Customer',
        amount_due: formatCurrency(invoice.amount_due, invoice.currency),
        due_date: formatDate(invoice.due_date),
        payment_link_section: paymentLinkSection
    });

    try {
        await emailService.sendEmail({
            to: invoice.customer_email,
            subject: template.subject,
            html: template.html
        });
        logger.info(`Invoice email sent to ${invoice.customer_email} for invoice ${invoice.invoice_number}`);
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

    const template = applyTemplate(EMAIL_TEMPLATES.paymentReceived, {
        invoice_number: invoice.invoice_number,
        business_name: settings.business_name || 'Our Company',
        business_email: settings.business_email || '',
        customer_name: invoice.customer_name || 'Valued Customer',
        amount_paid: formatCurrency(payment.amount, invoice.currency),
        payment_date: formatDate(payment.paid_at || payment.created_at)
    });

    try {
        await emailService.sendEmail({
            to: invoice.customer_email,
            subject: template.subject,
            html: template.html
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

    const template = applyTemplate(EMAIL_TEMPLATES.paymentReminder, {
        invoice_number: invoice.invoice_number,
        business_name: settings.business_name || 'Our Company',
        business_email: settings.business_email || '',
        customer_name: invoice.customer_name || 'Valued Customer',
        amount_due: formatCurrency(invoice.amount_due, invoice.currency),
        due_date: formatDate(invoice.due_date),
        reminder_text: isOverdue 
            ? `is now ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
            : 'is due soon',
        reminder_bg: isOverdue ? '#fee2e2' : '#fef3c7',
        due_date_color: isOverdue ? '#dc2626' : '#d97706',
        payment_link_section: paymentLinkSection
    });

    try {
        await emailService.sendEmail({
            to: invoice.customer_email,
            subject: template.subject,
            html: template.html
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

    const template = applyTemplate(EMAIL_TEMPLATES.estimateSent, {
        estimate_number: estimate.estimate_number,
        business_name: settings.business_name || 'Our Company',
        business_email: settings.business_email || '',
        customer_name: estimate.customer_name || 'Valued Customer',
        total: formatCurrency(estimate.total, estimate.currency),
        valid_until: formatDate(estimate.valid_until)
    });

    try {
        await emailService.sendEmail({
            to: estimate.customer_email,
            subject: template.subject,
            html: template.html
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
