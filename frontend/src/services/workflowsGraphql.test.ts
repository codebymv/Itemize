import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  activateWorkflowViaGraphql,
  cancelWorkflowEnrollmentViaGraphql,
  createWorkflowViaGraphql,
  deleteWorkflowViaGraphql,
  duplicateWorkflowViaGraphql,
  enrollContactInWorkflowViaGraphql,
  getWorkflowEnrollmentsViaGraphql,
  getWorkflowsViaGraphql,
  resetWorkflowQueueCapabilities,
  retryWorkflowEnrollmentViaGraphql,
  updateWorkflowViaGraphql,
} from './workflowsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(), getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const workflow = {
  id: 9, organizationId: 4, name: 'Welcome', description: null,
  triggerType: 'contact_added', triggerConfig: {}, scheduledContactId: null,
  nextTriggerAt: null, lastTriggeredAt: null, isActive: false,
  stats: { enrolled: 0, completed: 0, failed: 0 }, createdById: 7,
  createdByName: 'Owner', createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T11:00:00.000Z', stepCount: 1, activeEnrollments: 0,
  affectedEnrollments: 0,
  enrollmentStats: { activeCount: 0, completedCount: 0, failedCount: 0, totalCount: 0 },
  steps: [{ id: 12, workflowId: 9, stepOrder: 1, stepType: 'add_tag',
    stepConfig: { tag_name: 'welcome' }, conditionConfig: null,
    trueBranchStep: null, falseBranchStep: null }],
};
const enrollment = {
  id: 14, workflowId: 9, contactId: 22, currentStep: 2, status: 'failed',
  triggerData: { source: 'manual' }, context: { completed: [1] }, errorMessage: 'provider timeout',
  enrolledAt: '2026-07-21T10:00:00.000Z', nextActionAt: null, completedAt: null,
  firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.itemize', company: null,
};
const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('workflow GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkflowQueueCapabilities();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('workflow-csrf');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('maps one cancellable workflow page with filters and organization-wide stats', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { workflows: {
      nodes: [workflow],
      pageInfo: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
      stats: { total: 8, active: 3, inactive: 5, running: 7, completed: 12, failed: 2 },
    } } }));
    const controller = new AbortController();
    const result = await getWorkflowsViaGraphql(4, {
      trigger_type: 'contact_added', is_active: false, search: ' welcome ', page: 2, limit: 25,
    }, controller.signal);
    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 26, totalPages: 2 });
    expect(result.stats).toEqual({ total: 8, active: 3, inactive: 5, running: 7, completed: 12, failed: 2 });
    expect(result.workflows[0]).toMatchObject({
      id: 9, organization_id: 4, trigger_type: 'contact_added', step_count: 1,
      enrollment_stats: { active_count: 0, total_count: 0 },
    });
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.variables).toEqual({
      filter: { triggerType: 'contact_added', isActive: false, search: 'welcome' },
      page: { page: 2, pageSize: 25 },
    });
    expect(request.signal).toBe(controller.signal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses one consolidated legacy queue request after schema capability detection', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        errors: [{ message: 'Cannot query field "stats" on type "WorkflowPage".' }],
      }))
      .mockResolvedValueOnce(response({ data: {
        workflows: {
          nodes: [workflow],
          pageInfo: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        workflowPerformance: { summary: {
          totalWorkflows: 8,
          activeWorkflows: 3,
          completedEnrollments: 12,
          activeEnrollments: 7,
          failedEnrollments: 2,
        } },
      } }));

    await expect(getWorkflowsViaGraphql(4, { page: 1, limit: 20 })).resolves.toMatchObject({
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      stats: { total: 8, active: 3, inactive: 5, running: 7, completed: 12, failed: 2 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body));
    expect(fallbackBody.query).toContain('query WorkflowDefinitionsLegacy');
  });

  it('maps protected definition writes and verifies delete postconditions', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createWorkflow: workflow } }))
      .mockResolvedValueOnce(response({ data: { updateWorkflow: workflow } }))
      .mockResolvedValueOnce(response({ data: { activateWorkflow: { ...workflow, isActive: true } } }))
      .mockResolvedValueOnce(response({ data: { duplicateWorkflow: { ...workflow, id: 10 } } }))
      .mockResolvedValueOnce(response({ data: { deleteWorkflow: { deletedId: 9, success: true } } }));
    await createWorkflowViaGraphql({
      organization_id: 4, name: 'Welcome', trigger_type: 'contact_added', trigger_config: {},
      steps: [{ step_order: 1, step_type: 'condition', step_config: {}, condition_config: {}, true_branch_step: 2 }],
    }, 'workflow-create-key');
    await updateWorkflowViaGraphql(9, { description: null, steps: [] }, 4);
    await activateWorkflowViaGraphql(9, 4);
    await duplicateWorkflowViaGraphql(9, 'workflow-duplicate-key', 4);
    await deleteWorkflowViaGraphql(9, 4);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables.input).toEqual({
      name: 'Welcome', triggerType: 'contact_added', triggerConfig: {},
      steps: [{ stepType: 'condition', stepConfig: {}, conditionConfig: {}, trueBranchStep: 2 }],
    });
    expect(bodies[0].variables.idempotencyKey).toBe('workflow-create-key');
    expect(bodies[1].variables).toEqual({ id: 9, input: { description: null, steps: [] } });
    expect(bodies[3].variables).toEqual({
      id: 9, idempotencyKey: 'workflow-duplicate-key',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(5);
  });

  it('maps enrollment paging, enrollment input, and lifecycle mutations to the REST contract', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { workflowEnrollments: {
        nodes: [enrollment], pageInfo: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
      } } }))
      .mockResolvedValueOnce(response({ data: { enrollContactInWorkflow: { ...enrollment, status: 'active', currentStep: 1 } } }))
      .mockResolvedValueOnce(response({ data: { retryWorkflowEnrollment: { ...enrollment, status: 'active' } } }))
      .mockResolvedValueOnce(response({ data: { cancelWorkflowEnrollment: { ...enrollment, status: 'cancelled' } } }));
    const page = await getWorkflowEnrollmentsViaGraphql(9, 4, { status: 'failed', page: 2, limit: 25 });
    expect(page).toMatchObject({
      enrollments: [{
        id: 14, workflow_id: 9, contact_id: 22, current_step: 2, status: 'failed',
        error_message: 'provider timeout', first_name: 'Ada', email: 'ada@test.itemize',
      }],
      pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });
    await enrollContactInWorkflowViaGraphql(9, 22, 4, { source: 'manual' });
    await retryWorkflowEnrollmentViaGraphql(9, 14, 4);
    await cancelWorkflowEnrollmentViaGraphql(9, 14, 4);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables).toEqual({
      workflowId: 9, filter: { status: 'failed' }, page: { page: 2, pageSize: 25 },
    });
    expect(bodies[1].variables).toEqual({
      workflowId: 9, input: { contactId: 22, triggerData: { source: 'manual' } },
    });
    expect(bodies.slice(2).map((body) => body.variables)).toEqual([
      { workflowId: 9, enrollmentId: 14 }, { workflowId: 9, enrollmentId: 14 },
    ]);
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });
});
