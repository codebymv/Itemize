/**
 * Automations API Service
 * Handles workflows and email templates API calls
 */

import { sendEmailTemplateTestViaGraphql } from './messageDeliveryGraphql';
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

export interface WorkflowStats {
  total: number;
  active: number;
  inactive: number;
  running: number;
  completed: number;
  failed: number;
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

// ===================
// Workflows API
// ===================

export const getWorkflows = async (organizationId: number, params?: {
  trigger_type?: WorkflowTriggerType;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}, signal?: AbortSignal): Promise<{
  workflows: Workflow[];
  total: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: WorkflowStats;
}> => {
  return signal === undefined
    ? getWorkflowsViaGraphql(organizationId, params)
    : getWorkflowsViaGraphql(organizationId, params, signal);
};

export const getWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  return getWorkflowViaGraphql(id, organizationId);
};

export const createWorkflow = async (data: {
  organization_id: number;
  name: string;
  description?: string;
  trigger_type: Workflow['trigger_type'];
  trigger_config?: WorkflowConfig;
  steps?: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
}, idempotencyKey: string): Promise<Workflow> => {
  return createWorkflowViaGraphql(data, idempotencyKey);
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
  if (!data.organization_id) {
    throw new Error('organization_id is required for GraphQL workflow updates');
  }
  const { organization_id: organizationId, ...input } = data;
  return updateWorkflowViaGraphql(id, input, organizationId);
};

export const deleteWorkflow = async (id: number, organizationId: number): Promise<void> => {
  return deleteWorkflowViaGraphql(id, organizationId);
};

export const activateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  return activateWorkflowViaGraphql(id, organizationId);
};

export const deactivateWorkflow = async (id: number, organizationId: number): Promise<Workflow> => {
  return deactivateWorkflowViaGraphql(id, organizationId);
};

export const enrollContact = async (
  workflowId: number,
  contactId: number,
  organizationId: number,
  triggerData?: WorkflowConfig
): Promise<WorkflowEnrollment> => {
  return enrollContactInWorkflowViaGraphql(workflowId, contactId, organizationId, triggerData);
};

export const getWorkflowEnrollments = async (
  workflowId: number,
  organizationId: number,
  params?: {
    status?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<{
  enrollments: WorkflowEnrollment[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  return signal === undefined
    ? getWorkflowEnrollmentsViaGraphql(workflowId, organizationId, params)
    : getWorkflowEnrollmentsViaGraphql(workflowId, organizationId, params, signal);
};

export const cancelEnrollment = async (
  workflowId: number,
  enrollmentId: number,
  organizationId: number
): Promise<WorkflowEnrollment> => {
  return cancelWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
};

const changeEnrollmentState = async (
  action: 'pause' | 'resume' | 'retry',
  workflowId: number,
  enrollmentId: number,
  organizationId: number,
): Promise<WorkflowEnrollment> => {
  if (action === 'pause') {
    return pauseWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
  }
  if (action === 'resume') {
    return resumeWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
  }
  return retryWorkflowEnrollmentViaGraphql(workflowId, enrollmentId, organizationId);
};

export const pauseEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('pause', workflowId, enrollmentId, organizationId);

export const resumeEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('resume', workflowId, enrollmentId, organizationId);

export const retryEnrollment = (workflowId: number, enrollmentId: number, organizationId: number) =>
  changeEnrollmentState('retry', workflowId, enrollmentId, organizationId);

export const duplicateWorkflow = async (
  id: number,
  idempotencyKey: string,
  organizationId: number,
): Promise<Workflow> => {
  return duplicateWorkflowViaGraphql(id, idempotencyKey, organizationId);
};

// ===================
// Email Templates API
// ===================

export const getEmailTemplates = async (organizationId: number, params?: {
  category?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}, signal?: AbortSignal) => {
  return signal
    ? getEmailTemplatesViaGraphql(params, organizationId, signal)
    : getEmailTemplatesViaGraphql(params, organizationId);
};

export const getEmailTemplate = async (id: number, organizationId: number): Promise<EmailTemplate> => {
  return getEmailTemplateViaGraphql(id, organizationId);
};

export const createEmailTemplate = async (data: {
  organization_id: number;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  category?: string;
  is_active?: boolean;
}, idempotencyKey: string): Promise<EmailTemplate> => {
  return createEmailTemplateViaGraphql(data, idempotencyKey, data.organization_id);
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
  return updateEmailTemplateViaGraphql(id, data, data.organization_id);
};

export const deleteEmailTemplate = async (id: number, organizationId: number): Promise<void> => {
  return deleteEmailTemplateViaGraphql(id, organizationId);
};

export const sendTestEmail = async (
  templateId: number,
  toEmail: string,
  organizationId: number,
  sampleData?: WorkflowConfig
): Promise<{ success: boolean; message: string; simulated?: boolean }> => {
  return sendEmailTemplateTestViaGraphql(
    templateId,
    toEmail,
    sampleData,
    organizationId,
  );
};

export const duplicateEmailTemplate = async (id: number, idempotencyKey: string, organizationId: number): Promise<EmailTemplate> => {
  return duplicateEmailTemplateViaGraphql(id, idempotencyKey, organizationId);
};

export const getTemplateCategories = async (organizationId: number): Promise<{
  categories: { category: string; count: number }[];
}> => {
  return getEmailTemplateCategoriesViaGraphql(organizationId);
};
