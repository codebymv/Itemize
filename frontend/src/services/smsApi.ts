/**
 * SMS API Service
 * Handles SMS templates, sending, and related operations
 */

import api from '@/lib/api';

// Types
export interface SmsTemplate {
  id: number;
  organization_id: number;
  name: string;
  message: string;
  variables: string[];
  category: string;
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SmsLog {
  id: number;
  organization_id: number;
  contact_id: number | null;
  template_id: number | null;
  workflow_enrollment_id: number | null;
  conversation_id: number | null;
  to_phone: string;
  from_phone: string | null;
  message: string;
  direction: 'inbound' | 'outbound';
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'received';
  external_id: string | null;
  segments: number;
  error_code: string | null;
  error_message: string | null;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}

export interface MessageInfo {
  length: number;
  segments: number;
  encoding: 'GSM' | 'Unicode';
  charsRemaining: number;
}

export interface CreateSmsTemplateData {
  name: string;
  message: string;
  category?: string;
  is_active?: boolean;
  organization_id?: number;
}

export interface UpdateSmsTemplateData {
  name?: string;
  message?: string;
  category?: string;
  is_active?: boolean;
  organization_id?: number;
}

export interface SendSmsToContactData {
  contact_id: number;
  template_id?: number;
  message?: string;
  organization_id?: number;
}

// Helper to get organization header
const getOrgHeader = (organizationId?: number) => {
  if (organizationId) {
    return { 'x-organization-id': String(organizationId) };
  }
  return {};
};

/**
 * Get all SMS templates for an organization
 */
export const getSmsTemplates = async (
  organizationId?: number,
  filters?: { category?: string; is_active?: string; search?: string }
) => {
  const params = new URLSearchParams();
  if (organizationId) params.append('organization_id', String(organizationId));
  if (filters?.category) params.append('category', filters.category);
  if (filters?.is_active) params.append('is_active', filters.is_active);
  if (filters?.search) params.append('search', filters.search);

  const response = await api.get(`/api/sms-templates?${params.toString()}`, {
    headers: getOrgHeader(organizationId),
  });
  return response.data;
};

/**
 * Get a single SMS template
 */
export const getSmsTemplate = async (id: number, organizationId?: number) => {
  const response = await api.get(`/api/sms-templates/${id}`, {
    headers: getOrgHeader(organizationId),
  });
  return response.data as SmsTemplate;
};

/**
 * Create a new SMS template
 */
export const createSmsTemplate = async (data: CreateSmsTemplateData) => {
  const response = await api.post('/api/sms-templates', data, {
    headers: getOrgHeader(data.organization_id),
  });
  return response.data as SmsTemplate;
};

/**
 * Update an SMS template
 */
export const updateSmsTemplate = async (id: number, data: UpdateSmsTemplateData) => {
  const response = await api.put(`/api/sms-templates/${id}`, data, {
    headers: getOrgHeader(data.organization_id),
  });
  return response.data as SmsTemplate;
};

/**
 * Delete an SMS template
 */
export const deleteSmsTemplate = async (id: number, organizationId?: number) => {
  const response = await api.delete(`/api/sms-templates/${id}`, {
    headers: getOrgHeader(organizationId),
  });
  return response.data;
};

/**
 * Send test SMS using a template
 */
export const sendTestSms = async (
  templateId: number,
  toPhone: string,
  organizationId?: number,
  sampleData?: Record<string, string>
) => {
  const response = await api.post(
    `/api/sms-templates/${templateId}/send-test`,
    {
      to_phone: toPhone,
      sample_data: sampleData,
    },
    {
      headers: getOrgHeader(organizationId),
    }
  );
  return response.data;
};

/**
 * Duplicate an SMS template
 */
export const duplicateSmsTemplate = async (id: number, organizationId?: number) => {
  const response = await api.post(
    `/api/sms-templates/${id}/duplicate`,
    {},
    {
      headers: getOrgHeader(organizationId),
    }
  );
  return response.data as SmsTemplate;
};

/**
 * Send SMS to a contact
 */
export const sendSmsToContact = async (data: SendSmsToContactData) => {
  const response = await api.post('/api/sms-templates/send-to-contact', data, {
    headers: getOrgHeader(data.organization_id),
  });
  return response.data;
};

/**
 * Get message info (character count, segments, encoding)
 */
export const getMessageInfo = async (message: string): Promise<MessageInfo> => {
  const response = await api.post('/api/sms-templates/message-info', { message });
  return response.data;
};

/**
 * Get template categories
 */
export const getSmsTemplateCategories = async (organizationId?: number) => {
  const response = await api.get('/api/sms-templates/categories/list', {
    headers: getOrgHeader(organizationId),
  });
  return response.data;
};

export default {
  getSmsTemplates,
  getSmsTemplate,
  createSmsTemplate,
  updateSmsTemplate,
  deleteSmsTemplate,
  sendTestSms,
  duplicateSmsTemplate,
  sendSmsToContact,
  getMessageInfo,
  getSmsTemplateCategories,
};
