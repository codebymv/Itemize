/**
 * Signature Email Service
 * Sends signature request and completion emails
 */

const { logger } = require('../utils/logger');
const { wrapInBrandedTemplate } = require('./email-template.service');
const emailService = require('./emailService');

function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function buildSignatureRequestEmail({ recipientName, documentTitle, senderName, senderEmail, message, signingUrl, expiresAt, isPreview, baseUrl }) {
    const senderLabel = senderEmail || senderName || 'Itemize';
    const subject = `${senderLabel} wants your signature`;
    const safeMessage = (message || '').trim();
    const bodyContent = `
        <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">
            ${safeMessage}
        </div>
        <div style="text-align: center; margin: 24px 0;">
            <a href="${signingUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                Review and Sign
            </a>
        </div>
        ${documentTitle ? `<p style="color: #6b7280; font-size: 13px;">Document: ${documentTitle}</p>` : ''}
        ${expiresAt ? `<p style="color: #6b7280; font-size: 13px;">Expires on ${formatDate(expiresAt)}</p>` : ''}
    `;

    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: Boolean(isPreview),
        showUnsubscribe: false,
        showHeader: true,
        showFooter: true,
        baseUrl
    });

    return { subject, html };
}

async function sendSignatureRequest({ to, recipientName, documentTitle, senderName, senderEmail, message, signingUrl, expiresAt }) {
    if (!emailService) return false;

    const { subject, html } = buildSignatureRequestEmail({
        recipientName,
        documentTitle,
        senderName,
        senderEmail,
        message,
        signingUrl,
        expiresAt,
        isPreview: false
    });

    try {
        await emailService.sendEmail({ to, subject, html });
        return true;
    } catch (error) {
        logger.error('Failed to send signature request email', { error: error.message });
        return false;
    }
}

async function sendSignatureCompleted({ to, documentTitle, signerName }) {
    if (!emailService) return false;

    const subject = `Signature completed for ${documentTitle || 'Document'}`;
    const bodyContent = `
        <h1 style="font-size: 22px; margin: 0 0 16px; color: #111827;">
            Document signed
        </h1>
        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
            ${signerName || 'A recipient'} has completed their signature for ${documentTitle || 'your document'}.
        </p>
    `;

    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({ to, subject, html });
        return true;
    } catch (error) {
        logger.error('Failed to send signature completed email', { error: error.message });
        return false;
    }
}

async function sendDocumentCompleted({ to, documentTitle, downloadUrl }) {
    if (!emailService) return false;

    const subject = `Document completed: ${documentTitle || 'Document'}`;
    const bodyContent = `
        <h1 style="font-size: 22px; margin: 0 0 16px; color: #111827;">
            All signatures completed
        </h1>
        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
            The document ${documentTitle || ''} has been fully signed.
        </p>
        ${downloadUrl ? `<a href="${downloadUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 18px; border-radius: 6px;">Download Signed PDF</a>` : ''}
    `;

    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({ to, subject, html });
        return true;
    } catch (error) {
        logger.error('Failed to send document completed email', { error: error.message });
        return false;
    }
}

async function sendSignatureReminder({ to, recipientName, documentTitle, senderName, message, signingUrl, expiresAt }) {
    const subject = `Reminder: Please sign ${documentTitle || 'Document'}`;
    const bodyContent = `
        <h1 style="font-size: 22px; margin: 0 0 16px; color: #111827;">
            Signature Reminder
        </h1>
        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
            Hi ${recipientName || 'there'},
        </p>
        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
            This is a reminder to sign ${documentTitle || 'the document'} from ${senderName || 'Itemize'}.
        </p>
        ${message ? `<div style="white-space: pre-wrap; color: #374151; margin: 0 0 16px; line-height: 1.6;">${message}</div>` : ''}
        <div style="text-align: center; margin: 24px 0;">
            <a href="${signingUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                Review and Sign
            </a>
        </div>
        ${expiresAt ? `<p style="color: #6b7280; font-size: 13px;">Expires on ${formatDate(expiresAt)}</p>` : ''}
    `;

    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({ to, subject, html });
        return true;
    } catch (error) {
        logger.error('Failed to send signature reminder email', { error: error.message });
        return false;
    }
}

async function sendSignatureDeclined({ to, documentTitle, recipientName, reason }) {
    if (!emailService) return false;

    const subject = `Signature declined for ${documentTitle || 'Document'}`;
    const bodyContent = `
        <h1 style="font-size: 22px; margin: 0 0 16px; color: #111827;">
            Signature declined
        </h1>
        <p style="color: #374151; margin: 0 0 16px; line-height: 1.6;">
            ${recipientName || 'A recipient'} declined to sign ${documentTitle || 'your document'}.
        </p>
        ${reason ? `<p style="color: #6b7280; font-size: 14px;">Reason: ${reason}</p>` : ''}
    `;

    const html = wrapInBrandedTemplate(bodyContent, {
        subject,
        isPreview: false,
        showUnsubscribe: false
    });

    try {
        await emailService.sendEmail({ to, subject, html });
        return true;
    } catch (error) {
        logger.error('Failed to send signature declined email', { error: error.message });
        return false;
    }
}

async function sendReminderEmails(documentData, signingUrlBase) {
    const { document, recipients } = documentData;
    for (const recipient of recipients) {
        if (recipient.status !== 'sent' && recipient.status !== 'viewed') continue;
        const token = recipient.signing_token || null;
        const signingUrl = token ? `${signingUrlBase}/${token}` : signingUrlBase;

        await sendSignatureRequest({
            to: recipient.email,
            recipientName: recipient.name,
            documentTitle: document.title,
            senderName: document.sender_name || 'Itemize',
            message: document.message,
            signingUrl,
            expiresAt: document.expires_at
        });
    }
}

module.exports = {
    sendSignatureRequest,
    sendSignatureCompleted,
    sendDocumentCompleted,
    sendSignatureDeclined,
    sendSignatureReminder,
    sendReminderEmails,
    buildSignatureRequestEmail
};
