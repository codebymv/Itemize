/**
 * Email API Service
 * Handles email sending and template operations
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface EmailTemplate {
    id: number;
    organization_id: number;
    name: string;
    subject: string;
    body_html: string;
    body_text?: string;
    variables: string[];
    category: string;
    is_active: boolean;
    created_by: number;
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
    const params: Record<string, string> = {};
    if (filters?.category) params.category = filters.category;
    if (filters?.is_active !== undefined) params.is_active = String(filters.is_active);
    if (filters?.search) params.search = filters.search;

    const response = await api.get('/api/email-templates', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get a single email template
 */
export const getEmailTemplate = async (
    templateId: number,
    organizationId?: number
): Promise<EmailTemplate> => {
    const response = await api.get(`/api/email-templates/${templateId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Send email to a specific contact
 */
export const sendEmailToContact = async (
    params: SendEmailToContactParams,
    organizationId?: number
): Promise<SendEmailResult> => {
    const response = await api.post('/api/email-templates/send-to-contact', params, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Send a test email
 */
export const sendTestEmail = async (
    templateId: number,
    toEmail: string,
    sampleData?: Record<string, string>,
    organizationId?: number
): Promise<SendEmailResult> => {
    const response = await api.post(
        `/api/email-templates/${templateId}/send-test`,
        { to_email: toEmail, sample_data: sampleData },
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

export default {
    getEmailTemplates,
    getEmailTemplate,
    sendEmailToContact,
    sendTestEmail,
};
