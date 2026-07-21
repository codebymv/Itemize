/**
 * Automations API Service
 * Handles workflows and email templates API calls
 */

import api from '@/lib/api';
import {
  createEmailTemplateViaGraphql,
  deleteEmailTemplateViaGraphql,
  duplicateEmailTemplateViaGraphql,
  getEmailTemplateCategoriesViaGraphql,
  getEmailTemplateViaGraphql,
  getEmailTemplatesViaGraphql,
  updateEmailTemplateViaGraphql,
} from './emailTemplatesGraphql';
import {
  isEmailTemplateGraphqlMutationsEnabled,
  isEmailTemplateGraphqlReadsEnabled,
  isWorkflowGraphqlMutationsEnabled,
  isWorkflowGraphqlReadsEnabled,
  isWorkflowEnrollmentsGraphqlEnabled,
} from './graphqlClient';
import {
  activateWorkflowViaGraphql,
  createWorkflowViaGraphql,
  deactivateWorkflowViaGraphql,
  deleteWorkflowViaGraphql,
  duplicateWorkflowViaGraphql,
  getWorkflowViaGraphql,
  getWorkflowsViaGraphql,
  updateWorkflowViaGraphql,
  cancelWorkflowEnrollmentViaGraphql,
  enrollContactInWorkflowViaGraphql,
  getWorkflowEnrollmentsViaGraphql,
  pauseWorkflowEnrollmentViaGraphql,
  resumeWorkflowEnrollmentViaGraphql,
  retryWorkflowEnrollmentViaGraphql,
} from './workflowsGraphql';
import type {
  WorkflowStepType,
  WorkflowTriggerType,
} from '@/domain/workflowRegistry';

type WorkflowConfig = Record<string, unknown>;

const unwrapResponse = <T>(payload: unknown): T => {
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
  step_type: WorkflowStepType;
  step_config: WorkflowConfig;
  condition_config?: WorkflowConfig | null;
  true_branch_step?: number;
  false_branch_step?: number;
}

export interface Workflow {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  trigger_type: WorkflowTriggerType;
  trigger_config: WorkflowConfig;
  scheduled_contact_id?: number | null;
  next_trigger_at?: string | null;
  last_triggered_at?: string | null;
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
  trigger_data: WorkflowConfig;
  context: WorkflowConfig;
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
  body_text?: string | null;
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
  trigger_type?: WorkflowTriggerType;
  is_active?: boolean;
  search?: string;
}): Promise<{ workflows: Workflow[]; total: number }> => {
  if (isWorkflowGraphqlReadsEnabled()) {
    return getWorkflowsViaGraphql(organizationId, params);
  }
  const response = await api.get('/api/workflows', {
    params: { organization_id: organizationId, ...params },
  });
  return unwrapResponse<{ workflows: Workflow[]; total: number }>(response.data);
};

export const getWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  if (isWorkflowGraphqlReadsEnabled()) {
    return getWorkflowViaGraphql(id, organizationId);
  }
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
  trigger_config?: WorkflowConfig;
  steps?: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
}): Promise<Workflow> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    return createWorkflowViaGraphql(data);
  }
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
    trigger_config: WorkflowConfig;
    steps: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
  }>
): Promise<Workflow> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    if (!data.organization_id) {
      throw new Error('organization_id is required for GraphQL workflow updates');
    }
    const { organization_id: organizationId, ...input } = data;
    return updateWorkflowViaGraphql(id, input, organizationId);
  }
  const response = await api.put(`/api/workflows/${id}`, data);
  return unwrapResponse<Workflow>(response.data);
};

export const deleteWorkflow = async (id: number, organizationId: number): Promise<void> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    return deleteWorkflowViaGraphql(id, organizationId);
  }
  await api.delete(`/api/workflows/${id}`, {
    params: { organization_id: organizationId },
  });
};

export const activateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    return activateWorkflowViaGraphql(id, organizationId);
  }
  const response = await api.post(`/api/workflows/${id}/activate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<Workflow>(response.data);
};

export const deactivateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    return deactivateWorkflowViaGraphql(id, organizationId);
  }
  const response = await api.post(`/api/workflows/${id}/deactivate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<Workflow>(response.data);
};

export const enrollContact = async (
  workflowId: number,
  contactId: number,
  organizationId: number,
  triggerData?: WorkflowConfig
): Promise<WorkflowEnrollment> => {
  if (isWorkflowEnrollmentsGraphqlEnabled()) {
    return enrollContactInWorkflowViaGraphql(workflowId, contactId, organizationId, triggerData);
  }
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
  if (isWorkflowEnrollmentsGraphqlEnabled()) {
    return getWorkflowEnrollmentsViaGraphql(workflowId, organizationId, params);
  }
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
  if (isWorkflowEnrollmentsGraphqlEnabled()) {
    return cancelWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
  }
  const response = await api.delete(`/api/workflows/${workflowId}/enrollments/${enrollmentId}`, {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<WorkflowEnrollment>(response.data);
};

const changeEnrollmentState = async (
  action: 'pause' | 'resume' | 'retry',
  workflowId: number,
  enrollmentId: number,
  organizationId: number,
): Promise<WorkflowEnrollment> => {
  if (isWorkflowEnrollmentsGraphqlEnabled()) {
    if (action === 'pause') {
      return pauseWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
    }
    if (action === 'resume') {
      return resumeWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
    }
    return retryWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
  }
  const response = await api.post(`/api/workflows/${workflowId}/enrollments/${enrollmentId}/${action}`, {
    organization_id: organizationId,
  });
  return unwrapResponse<WorkflowEnrollment>(response.data);
};

export const pauseEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('pause', workflowId, enrollmentId, organizationId);

export const resumeEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('resume', workflowId, enrollmentId, organizationId);

export const retryEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('retry', workflowId, enrollmentId, organizationId);

export const duplicateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  if (isWorkflowGraphqlMutationsEnabled()) {
    return duplicateWorkflowViaGraphql(id, organizationId);
  }
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
  if (isEmailTemplateGraphqlReadsEnabled()) {
    return getEmailTemplatesViaGraphql(params, organizationId);
  }
  const response = await api.get('/api/email-templates', {
    params: { organization_id: organizationId, ...params },
  });
  return unwrapResponse<{ templates: EmailTemplate[]; total: number }>(response.data);
};

export const getEmailTemplate = async (id: number, organizationId: number): Promise<EmailTemplate> => {
  if (isEmailTemplateGraphqlReadsEnabled()) {
    return getEmailTemplateViaGraphql(id, organizationId);
  }
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
  if (isEmailTemplateGraphqlMutationsEnabled()) {
    return createEmailTemplateViaGraphql(data, data.organization_id);
  }
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
  if (isEmailTemplateGraphqlMutationsEnabled()) {
    return updateEmailTemplateViaGraphql(id, data, data.organization_id);
  }
  const response = await api.put(`/api/email-templates/${id}`, data);
  return unwrapResponse<EmailTemplate>(response.data);
};

export const deleteEmailTemplate = async (id: number, organizationId: number): Promise<void> => {
  if (isEmailTemplateGraphqlMutationsEnabled()) {
    return deleteEmailTemplateViaGraphql(id, organizationId);
  }
  await api.delete(`/api/email-templates/${id}`, {
    params: { organization_id: organizationId },
  });
};

export const sendTestEmail = async (
  templateId: number,
  toEmail: string,
  organizationId: number,
  sampleData?: WorkflowConfig
): Promise<{ success: boolean; message: string; simulated?: boolean }> => {
  const response = await api.post(`/api/email-templates/${templateId}/send-test`, {
    organization_id: organizationId,
    to_email: toEmail,
    sample_data: sampleData,
  });
  return unwrapResponse<{ success: boolean; message: string; simulated?: boolean }>(response.data);
};

export const duplicateEmailTemplate = async (id: number, organizationId: number): Promise<EmailTemplate> => {
  if (isEmailTemplateGraphqlMutationsEnabled()) {
    return duplicateEmailTemplateViaGraphql(id, organizationId);
  }
  const response = await api.post(`/api/email-templates/${id}/duplicate`, {
    organization_id: organizationId,
  });
  return unwrapResponse<EmailTemplate>(response.data);
};

export const getTemplateCategories = async (organizationId: number): Promise<{
  categories: { category: string; count: number }[];
}> => {
  if (isEmailTemplateGraphqlReadsEnabled()) {
    return getEmailTemplateCategoriesViaGraphql(organizationId);
  }
  const response = await api.get('/api/email-templates/categories/list', {
    params: { organization_id: organizationId },
  });
  return unwrapResponse<{ categories: { category: string; count: number }[] }>(response.data);
};
