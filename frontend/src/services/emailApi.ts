/**
 * Email API Service
 * Handles email sending and template operations
 */
import {
    createEmailTemplateDraftViaGraphql,
    deleteEmailTemplateViaGraphql,
    duplicateEmailTemplateViaGraphql,
    getEmailTemplateViaGraphql,
    getEmailTemplatesViaGraphql,
    previewEmailTemplateViaGraphql,
    publishEmailTemplateViaGraphql,
    saveEmailTemplateDraftViaGraphql,
    type EmailTemplateInput,
    type EmailTemplatePreview,
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
    preheader?: string | null;
    body_html: string;
    body_text?: string | null;
    variables: string[];
    category: string;
    is_active: boolean;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
    draft_version?: number | null;
    published_version?: number | null;
    draft_subject?: string | null;
    draft_preheader?: string | null;
    draft_body_html?: string | null;
    draft_body_text?: string | null;
    draft_updated_at?: string | null;
    draft_is_active?: boolean | null;
    has_unpublished_changes?: boolean;
}

export type EmailTemplateDraftInput = EmailTemplateInput;
export type { EmailTemplatePreview };

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
    conversation_id?: number;
    message_id?: number;
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

export const createEmailTemplateDraft = async (
    input: EmailTemplateDraftInput,
    organizationId?: number
): Promise<EmailTemplate> => createEmailTemplateDraftViaGraphql(input, organizationId);

export const saveEmailTemplateDraft = async (
    templateId: number,
    input: EmailTemplateDraftInput,
    organizationId?: number
): Promise<EmailTemplate> => saveEmailTemplateDraftViaGraphql(templateId, input, organizationId);

export const publishEmailTemplate = async (
    templateId: number,
    isActive = true,
    organizationId?: number
): Promise<EmailTemplate> => publishEmailTemplateViaGraphql(templateId, isActive, organizationId);

export const previewEmailTemplate = async (
    input: Pick<EmailTemplateDraftInput, 'subject' | 'preheader' | 'body_html' | 'body_text'>,
    organizationId?: number
): Promise<EmailTemplatePreview> => previewEmailTemplateViaGraphql(input, organizationId);

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
  sampleData?: Record<string, string>,
  useDraft = false,
): Promise<SendEmailResult> => {
  if (!toEmail) throw new Error('A destination email address is required');
    return sendEmailTemplateTestViaGraphql(
      templateId, toEmail, sampleData, organizationId, useDraft,
    );
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
    createEmailTemplateDraft,
    saveEmailTemplateDraft,
    publishEmailTemplate,
    previewEmailTemplate,
    sendEmailToContact,
    sendTestEmail,
    deleteEmailTemplate,
    duplicateEmailTemplate,
};
