/**
 * SMS API Service
 * Handles SMS templates, sending, and related operations
 */

import {
  createSmsTemplateViaGraphql,
  deleteSmsTemplateViaGraphql,
  duplicateSmsTemplateViaGraphql,
  getSmsMessageInfoViaGraphql,
  getSmsTemplateCategoriesViaGraphql,
  getSmsTemplateViaGraphql,
  getSmsTemplatesViaGraphql,
  updateSmsTemplateViaGraphql,
} from './smsTemplatesGraphql';
import {
  enqueueContactSmsViaGraphql,
  sendSmsTemplateTestViaGraphql,
} from './messageDeliveryGraphql';
import type { SendEmailResult } from './emailApi';

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

/**
 * Get all SMS templates for an organization
 */
export const getSmsTemplates = async (
  organizationId?: number,
  filters?: { category?: string; is_active?: string; search?: string }
): Promise<{ templates: SmsTemplate[]; total?: number }> => {
  return getSmsTemplatesViaGraphql(filters, organizationId);
};

/**
 * Get a single SMS template
 */
export const getSmsTemplate = async (id: number, organizationId?: number) => {
  return getSmsTemplateViaGraphql(id, organizationId);
};

/**
 * Create a new SMS template
 */
export const createSmsTemplate = async (data: CreateSmsTemplateData, idempotencyKey: string) => {
  return createSmsTemplateViaGraphql(data, idempotencyKey);
};

/**
 * Update an SMS template
 */
export const updateSmsTemplate = async (id: number, data: UpdateSmsTemplateData) => {
  return updateSmsTemplateViaGraphql(id, data);
};

/**
 * Delete an SMS template
 */
export const deleteSmsTemplate = async (id: number, organizationId?: number) => {
  return deleteSmsTemplateViaGraphql(id, organizationId);
};

/**
 * Send test SMS using a template
 */
export const sendTestSms = async (
  templateId: number,
  toPhoneOrOrganizationId: string | number,
  organizationId?: number,
  sampleData?: Record<string, string>
) => {
  const toPhone = typeof toPhoneOrOrganizationId === 'string' ? toPhoneOrOrganizationId : '';
  const orgId = typeof toPhoneOrOrganizationId === 'number' ? toPhoneOrOrganizationId : organizationId;
  if (!toPhone) throw new Error('A destination phone number is required');
  return sendSmsTemplateTestViaGraphql(templateId, toPhone, sampleData, orgId);
};

/**
 * Duplicate an SMS template
 */
export const duplicateSmsTemplate = async (id: number, idempotencyKey: string, organizationId?: number) => {
  return duplicateSmsTemplateViaGraphql(id, idempotencyKey, organizationId);
};

/**
 * Send SMS to a contact
 */
export const sendSmsToContact = async (
  data: SendSmsToContactData,
  idempotencyKey?: string,
): Promise<SendEmailResult> => {
  return idempotencyKey === undefined
    ? enqueueContactSmsViaGraphql(data, data.organization_id)
    : enqueueContactSmsViaGraphql(data, data.organization_id, idempotencyKey);
};

/**
 * Get message info (character count, segments, encoding)
 */
export const getMessageInfo = async (message: string): Promise<MessageInfo> => {
  return getSmsMessageInfoViaGraphql(message);
};

/**
 * Get template categories
 */
export const getSmsTemplateCategories = async (organizationId?: number) => {
  return getSmsTemplateCategoriesViaGraphql(organizationId);
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
