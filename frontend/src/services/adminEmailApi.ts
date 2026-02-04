/**
 * Admin Email API Client
 * API methods for admin communications functionality
 */

import api from '../lib/api';

// ============================================
// Types
// ============================================

export interface EmailRecipient {
    id?: number;
    email: string;
    name?: string;
}

export interface SendEmailRequest {
    recipients: EmailRecipient[];
    subject: string;
    bodyHtml: string;
}

export interface SendEmailResponse {
    sent: number;
    failed: number;
    errors: string[];
}

export interface PreviewEmailRequest {
    subject: string;
    bodyHtml: string;
    baseUrl?: string;
}

export interface PreviewEmailResponse {
    html: string;
    subject: string;
}

export interface EmailLog {
    id: number;
    recipientEmail: string;
    recipientId: number | null;
    recipientName: string | null;
    subject: string;
    bodyHtml?: string;
    status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'unsubscribed';
    externalId: string | null;
    errorMessage: string | null;
    sentBy: number | null;
    sentByName: string | null;
    sentByEmail: string | null;
    sentAt: string | null;
    createdAt: string;
}

export interface EmailLogsResponse {
    logs: EmailLog[];
    total: number;
    hasMore: boolean;
}

export interface EmailTemplate {
    id: number;
    name: string;
    subject: string;
    bodyHtml: string;
    category: string;
    isActive: boolean;
    organizationId: number | null;
    organizationName: string | null;
    createdBy: number | null;
    createdByName: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EmailTemplatesResponse {
    templates: EmailTemplate[];
    total: number;
}

// ============================================
// API Methods
// ============================================

/**
 * Send emails to recipients
 */
export async function sendEmail(data: SendEmailRequest): Promise<SendEmailResponse> {
    const response = await api.post('/api/admin/email/send', data);
    return response.data.data;
}

/**
 * Get email preview HTML
 */
export async function getPreview(data: PreviewEmailRequest): Promise<PreviewEmailResponse> {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
    const response = await api.post('/api/admin/email/preview', { ...data, baseUrl });
    return response.data.data;
}

/**
 * Get email logs with pagination
 */
export async function getEmailLogs(params: {
    page?: number;
    limit?: number;
    status?: string;
}): Promise<EmailLogsResponse> {
    const { page = 0, limit = 50, status } = params;
    const response = await api.get('/api/admin/email/logs', {
        params: { page, limit, status }
    });
    return response.data.data;
}

/**
 * Get a single email log with full content
 */
export async function getEmailLog(id: number): Promise<EmailLog> {
    const response = await api.get(`/api/admin/email/logs/${id}`);
    return response.data.data;
}

/**
 * Get email templates (admin view - all organizations)
 */
export async function getEmailTemplates(params?: {
    category?: string;
    search?: string;
}): Promise<EmailTemplatesResponse> {
    const response = await api.get('/api/admin/email/templates', { params });
    return response.data.data;
}

// ============================================
// Helper Types for Compose
// ============================================

export interface ComposeEmailState {
    recipients: EmailRecipient[];
    subject: string;
    bodyHtml: string;
}

/**
 * Template variable helpers
 */
export const TEMPLATE_VARIABLES = [
    { key: 'userName', label: 'User Name', description: 'Recipient\'s name or email username' },
    { key: 'userEmail', label: 'User Email', description: 'Recipient\'s email address' },
    { key: 'dashboardUrl', label: 'Dashboard URL', description: 'Link to the dashboard' },
    { key: 'unsubscribeUrl', label: 'Unsubscribe URL', description: 'Link to unsubscribe' },
] as const;
