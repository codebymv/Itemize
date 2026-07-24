import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  cancelEnrollment, createWorkflow, enrollContact, getWorkflowEnrollments, getWorkflows,
  pauseEnrollment, resumeEnrollment, retryEnrollment, updateWorkflow,
} from './automationsApi';
import {
  cancelWorkflowEnrollmentViaGraphql,
  createWorkflowViaGraphql,
  enrollContactInWorkflowViaGraphql,
  getWorkflowEnrollmentsViaGraphql,
  pauseWorkflowEnrollmentViaGraphql,
  resumeWorkflowEnrollmentViaGraphql,
  retryWorkflowEnrollmentViaGraphql,
  getWorkflowsViaGraphql,
  updateWorkflowViaGraphql,
} from './workflowsGraphql';
import {
  isWorkflowEnrollmentsGraphqlEnabled,
  isWorkflowGraphqlMutationsEnabled,
  isWorkflowGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('./graphqlClient', () => ({
  isEmailTemplateGraphqlMutationsEnabled: vi.fn(() => false),
  isEmailTemplateGraphqlReadsEnabled: vi.fn(() => false),
  isWorkflowEnrollmentsGraphqlEnabled: vi.fn(),
  isWorkflowGraphqlMutationsEnabled: vi.fn(),
  isWorkflowGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./workflowsGraphql', () => ({
  activateWorkflowViaGraphql: vi.fn(), createWorkflowViaGraphql: vi.fn(),
  cancelWorkflowEnrollmentViaGraphql: vi.fn(), enrollContactInWorkflowViaGraphql: vi.fn(),
  deactivateWorkflowViaGraphql: vi.fn(), deleteWorkflowViaGraphql: vi.fn(),
  duplicateWorkflowViaGraphql: vi.fn(), getWorkflowViaGraphql: vi.fn(),
  getWorkflowEnrollmentsViaGraphql: vi.fn(), getWorkflowsViaGraphql: vi.fn(),
  pauseWorkflowEnrollmentViaGraphql: vi.fn(), resumeWorkflowEnrollmentViaGraphql: vi.fn(),
  retryWorkflowEnrollmentViaGraphql: vi.fn(), updateWorkflowViaGraphql: vi.fn(),
}));

const workflow = {
  id: 9, organization_id: 4, name: 'Welcome', trigger_type: 'contact_added' as const,
  trigger_config: {}, is_active: false, stats: { enrolled: 0, completed: 0, failed: 0 },
  created_at: '2026-07-21T10:00:00Z', updated_at: '2026-07-21T10:00:00Z',
};
const enrollment = {
  id: 14, workflow_id: 9, contact_id: 22, current_step: 1, status: 'active' as const,
  trigger_data: {}, context: {}, enrolled_at: '2026-07-21T10:00:00Z',
};

describe('workflow API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isWorkflowGraphqlMutationsEnabled).mockReturnValue(false);
    vi.mocked(isWorkflowEnrollmentsGraphqlEnabled).mockReturnValue(false);
  });

  it('retains workflow reads and writes on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: { workflows: [workflow], total: 1 } } });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: workflow } });
    await expect(getWorkflows(4, { search: 'welcome' })).resolves.toMatchObject({ total: 1 });
    await expect(createWorkflow({
      organization_id: 4, name: 'Welcome', trigger_type: 'contact_added', steps: [],
    })).resolves.toMatchObject({ id: 9 });
    expect(api.get).toHaveBeenCalledWith('/api/workflows', { params: { organization_id: 4, search: 'welcome' } });
    expect(api.post).toHaveBeenCalledWith('/api/workflows', {
      organization_id: 4, name: 'Welcome', trigger_type: 'contact_added', steps: [],
    });
  });

  it('routes definitions through independently enabled GraphQL flags', async () => {
    vi.mocked(isWorkflowGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isWorkflowGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getWorkflowsViaGraphql).mockResolvedValue({ workflows: [workflow], total: 1 });
    vi.mocked(createWorkflowViaGraphql).mockResolvedValue(workflow);
    vi.mocked(updateWorkflowViaGraphql).mockResolvedValue({ ...workflow, name: 'Renamed' });
    await getWorkflows(4, { is_active: false });
    await createWorkflow({ organization_id: 4, name: 'Welcome', trigger_type: 'contact_added' });
    await updateWorkflow(9, { organization_id: 4, name: 'Renamed', steps: [] });
    expect(getWorkflowsViaGraphql).toHaveBeenCalledWith(4, { is_active: false });
    expect(createWorkflowViaGraphql).toHaveBeenCalledWith({
      organization_id: 4, name: 'Welcome', trigger_type: 'contact_added',
    });
    expect(updateWorkflowViaGraphql).toHaveBeenCalledWith(9, { name: 'Renamed', steps: [] }, 4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('retains enrollment create/read/cancel on REST but always uses GraphQL lifecycle mutations', async () => {
    const page = { enrollments: [enrollment], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } };
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: enrollment } });
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: page } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true, data: { ...enrollment, status: 'cancelled' } } });
    vi.mocked(pauseWorkflowEnrollmentViaGraphql).mockResolvedValue({ ...enrollment, status: 'paused' });
    vi.mocked(resumeWorkflowEnrollmentViaGraphql).mockResolvedValue(enrollment);
    vi.mocked(retryWorkflowEnrollmentViaGraphql).mockResolvedValue(enrollment);
    await enrollContact(9, 22, 4, { source: 'manual' });
    await getWorkflowEnrollments(9, 4, { status: 'active', page: 1, limit: 50 });
    await cancelEnrollment(9, 14, 4);
    await pauseEnrollment(9, 14, 4);
    await resumeEnrollment(9, 14, 4);
    await retryEnrollment(9, 14, 4);
    expect(api.post).toHaveBeenCalledWith('/api/workflows/9/enroll', {
      organization_id: 4, contact_id: 22, trigger_data: { source: 'manual' },
    });
    expect(api.get).toHaveBeenCalledWith('/api/workflows/9/enrollments', {
      params: { organization_id: 4, status: 'active', page: 1, limit: 50 },
    });
    expect(api.delete).toHaveBeenCalledWith('/api/workflows/9/enrollments/14', {
      params: { organization_id: 4 },
    });
    expect(pauseWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(resumeWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(retryWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('routes enrollment operations through their independent GraphQL flag', async () => {
    const page = { enrollments: [enrollment], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } };
    vi.mocked(isWorkflowEnrollmentsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(enrollContactInWorkflowViaGraphql).mockResolvedValue(enrollment);
    vi.mocked(getWorkflowEnrollmentsViaGraphql).mockResolvedValue(page);
    vi.mocked(cancelWorkflowEnrollmentViaGraphql).mockResolvedValue({ ...enrollment, status: 'cancelled' });
    vi.mocked(pauseWorkflowEnrollmentViaGraphql).mockResolvedValue({ ...enrollment, status: 'paused' });
    vi.mocked(resumeWorkflowEnrollmentViaGraphql).mockResolvedValue(enrollment);
    vi.mocked(retryWorkflowEnrollmentViaGraphql).mockResolvedValue(enrollment);
    await enrollContact(9, 22, 4, { source: 'manual' });
    await getWorkflowEnrollments(9, 4, { status: 'active', page: 2, limit: 25 });
    await cancelEnrollment(9, 14, 4);
    await pauseEnrollment(9, 14, 4);
    await resumeEnrollment(9, 14, 4);
    await retryEnrollment(9, 14, 4);
    expect(enrollContactInWorkflowViaGraphql).toHaveBeenCalledWith(9, 22, 4, { source: 'manual' });
    expect(getWorkflowEnrollmentsViaGraphql).toHaveBeenCalledWith(9, 4, { status: 'active', page: 2, limit: 25 });
    expect(cancelWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(pauseWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(resumeWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(retryWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
