/**
 * Email API Service
 * Handles email sending and template operations
 */
import {
    deleteEmailTemplateViaGraphql,
    duplicateEmailTemplateViaGraphql,
    getEmailTemplateViaGraphql,
    getEmailTemplatesViaGraphql,
} from './emailTemplatesGraphql';
import {
    enqueueContactEmailViaGraphql,
    sendEmailTemplateTestViaGraphql,
} from './messageDeliveryGraphql';

// ======================
// Types
// ======================

export interface EmailTemplate {
    id: number;
    organization_id: number;
    name: string;
    subject: string;
    body_html: string;
    body_text?: string | null;
    variables: string[];
    category: string;
    is_active: boolean;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface SendEmailToContactParams {
    contact_id: number;
    template_id?: number;
    subject?: string;
    body_html?: string;
    body_text?: string;
    reply_to?: string;
}

export interface SendEmailResult {
    success: boolean;
    simulated?: boolean;
    message: string;
    email_id?: string;
    delivery_id?: string;
    status?: string;
    replayed?: boolean;
    error?: string;
}

// ======================
// API Functions
// ======================

/**
 * Get all email templates
 */
export const getEmailTemplates = async (
    organizationId?: number,
    filters?: { category?: string; is_active?: boolean; search?: string }
): Promise<{ templates: EmailTemplate[]; total: number }> => {
    return getEmailTemplatesViaGraphql(filters, organizationId);
};

/**
 * Get a single email template
 */
export const getEmailTemplate = async (
    templateId: number,
    organizationId?: number
): Promise<EmailTemplate> => {
    return getEmailTemplateViaGraphql(templateId, organizationId);
};

/**
 * Send email to a specific contact
 */
export const sendEmailToContact = async (
    params: SendEmailToContactParams,
    organizationId?: number
): Promise<SendEmailResult> => {
    return enqueueContactEmailViaGraphql(params, organizationId);
};

/**
 * Send a test email
 */
export const sendTestEmail = async (
    templateId: number,
    organizationId?: number,
    toEmail?: string,
    sampleData?: Record<string, string>
): Promise<SendEmailResult> => {
    if (!toEmail) throw new Error('A destination email address is required');
    return sendEmailTemplateTestViaGraphql(templateId, toEmail, sampleData, organizationId);
};

/**
 * Delete an email template
 */
export const deleteEmailTemplate = async (
    templateId: number,
    organizationId?: number
): Promise<void> => {
    return deleteEmailTemplateViaGraphql(templateId, organizationId);
};

/**
 * Duplicate an email template
 */
export const duplicateEmailTemplate = async (
    templateId: number,
    organizationId?: number
): Promise<EmailTemplate> => {
    return duplicateEmailTemplateViaGraphql(templateId, organizationId);
};

export default {
    getEmailTemplates,
    getEmailTemplate,
    sendEmailToContact,
    sendTestEmail,
    deleteEmailTemplate,
    duplicateEmailTemplate,
};
