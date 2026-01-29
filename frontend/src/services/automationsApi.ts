/**
 * Automations API Service
 * Handles workflows and email templates API calls
 */

import api from '@/lib/api';

const unwrapResponse = <T>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
};

// ===================
// Types
// ===================

export interface WorkflowStep {
  id?: number;
  workflow_id?: number;
  step_order: number;
  step_type: 'send_email' | 'add_tag' | 'remove_tag' | 'wait' | 'create_task' | 'move_deal' | 'webhook' | 'condition' | 'update_contact' | 'send_sms';
  step_config: Record<string, any>;
  condition_config?: Record<string, any> | null;
  true_branch_step?: number;
  false_branch_step?: number;
}

export interface Workflow {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  trigger_type: 'contact_added' | 'tag_added' | 'tag_removed' | 'deal_stage_changed' | 'form_submitted' | 'manual' | 'scheduled' | 'contact_updated';
  trigger_config: Record<string, any>;
  is_active: boolean;
  stats: {
    enrolled: number;
    completed: number;
    failed: number;
  };
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  steps?: WorkflowStep[];
  step_count?: number;
  active_enrollments?: number;
  enrollment_stats?: {
    active_count: number;
    completed_count: number;
    failed_count: number;
    total_count: number;
  };
}

export interface WorkflowEnrollment {
  id: number;
  workflow_id: number;
  contact_id: number;
  current_step: number;
  status: 'active' | 'completed' | 'paused' | 'failed' | 'cancelled';
  trigger_data: Record<string, any>;
  context: Record<string, any>;
  error_message?: string;
  enrolled_at: string;
  next_action_at?: string;
  completed_at?: string;
  // Joined contact data
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
}

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
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// ===================
// Workflows API
// ===================

export const getWorkflows = async (organizationId: number, params?: {
  trigger_type?: string;
  is_active?: boolean;
  search?: string;
}): Promise<{ workflows: Workflow[]; total: number }> => {
  const response = await api.get('/api/workflows', {
    params: { organization_id: organizationId, ...params },
  });
  return unwrapResponse<{ workflows: Workflow[]; total: number }>(response.data);
};

export const getWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  const response = await api.get(`/api/workflows/${id}`, {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<Workflow>(response.data);
};

export const createWorkflow = async (data: {
  organization_id: number;
  name: string;
  description?: string;
  trigger_type: Workflow['trigger_type'];
  trigger_config?: Record<string, any>;
  steps?: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
}): Promise<Workflow> => {
  const response = await api.post('/api/workflows', data);
  return unwrapResponse<Workflow>(response.data);
};

export const updateWorkflow = async (
  id: number,
  data: Partial<{
    organization_id: number;
    name: string;
    description: string;
    trigger_type: Workflow['trigger_type'];
    trigger_config: Record<string, any>;
    steps: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
  }>
): Promise<Workflow> => {
  const response = await api.put(`/api/workflows/${id}`, data);
  return unwrapResponse<Workflow>(response.data);
};

export const deleteWorkflow = async (id: number, organizationId: number): Promise<void> => {
  await api.delete(`/api/workflows/${id}`, {
    params: { organization_id: organizationId },
  });
};

export const activateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  const response = await api.post(`/api/workflows/${id}/activate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<Workflow>(response.data);
};

export const deactivateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  const response = await api.post(`/api/workflows/${id}/deactivate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<Workflow>(response.data);
};

export const enrollContact = async (
  workflowId: number,
  contactId: number,
  organizationId: number,
  triggerData?: Record<string, any>
): Promise<WorkflowEnrollment> => {
  const response = await api.post(`/api/workflows/${workflowId}/enroll`, {
    organization_id: organizationId,
    contact_id: contactId,
    trigger_data: triggerData,
  });
  return unwrapResponse<WorkflowEnrollment>(response.data);
};

export const getWorkflowEnrollments = async (
  workflowId: number,
  organizationId: number,
  params?: {
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<{
  enrollments: WorkflowEnrollment[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const response = await api.get(`/api/workflows/${workflowId}/enrollments`, {
    params: { organization_id: organizationId, ...params },
  });
  return unwrapResponse<{
    enrollments: WorkflowEnrollment[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(response.data);
};

export const cancelEnrollment = async (
  workflowId: number,
  enrollmentId: number,
  organizationId: number
): Promise<WorkflowEnrollment> => {
  const response = await api.delete(`/api/workflows/${workflowId}/enrollments/${enrollmentId}`, {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<WorkflowEnrollment>(response.data);
};

export const duplicateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  const response = await api.post(`/api/workflows/${id}/duplicate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<Workflow>(response.data);
};

// ===================
// Email Templates API
// ===================

export const getEmailTemplates = async (organizationId: number, params?: {
  category?: string;
  is_active?: boolean;
  search?: string;
}): Promise<{ templates: EmailTemplate[]; total: number }> => {
  const response = await api.get('/api/email-templates', {
    params: { organization_id: organizationId, ...params },
  });
  return unwrapResponse<{ templates: EmailTemplate[]; total: number }>(response.data);
};

export const getEmailTemplate = async (id: number, organizationId: number): Promise<EmailTemplate> => {
  const response = await api.get(`/api/email-templates/${id}`, {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<EmailTemplate>(response.data);
};

export const createEmailTemplate = async (data: {
  organization_id: number;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  category?: string;
  is_active?: boolean;
}): Promise<EmailTemplate> => {
  const response = await api.post('/api/email-templates', data);
  return unwrapResponse<EmailTemplate>(response.data);
};

export const updateEmailTemplate = async (
  id: number,
  data: Partial<{
    organization_id: number;
    name: string;
    subject: string;
    body_html: string;
    body_text: string;
    category: string;
    is_active: boolean;
  }>
): Promise<EmailTemplate> => {
  const response = await api.put(`/api/email-templates/${id}`, data);
  return unwrapResponse<EmailTemplate>(response.data);
};

export const deleteEmailTemplate = async (id: number, organizationId: number): Promise<void> => {
  await api.delete(`/api/email-templates/${id}`, {
    params: { organization_id: organizationId },
  });
};

export const sendTestEmail = async (
  templateId: number,
  toEmail: string,
  organizationId: number,
  sampleData?: Record<string, any>
): Promise<{ success: boolean; message: string; simulated?: boolean }> => {
  const response = await api.post(`/api/email-templates/${templateId}/send-test`, {
    organization_id: organizationId,
    to_email: toEmail,
    sample_data: sampleData,
  });
  return unwrapResponse<{ success: boolean; message: string; simulated?: boolean }>(response.data);
};

export const duplicateEmailTemplate = async (id: number, organizationId: number): Promise<EmailTemplate> => {
  const response = await api.post(`/api/email-templates/${id}/duplicate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<EmailTemplate>(response.data);
};

export const getTemplateCategories = async (organizationId: number): Promise<{
  categories: { category: string; count: number }[];
}> => {
  const response = await api.get('/api/email-templates/categories/list', {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<{ categories: { category: string; count: number }[] }>(response.data);
};
