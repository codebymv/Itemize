import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  activateWorkflowViaGraphql,
  cancelWorkflowEnrollmentViaGraphql,
  createWorkflowViaGraphql,
  deleteWorkflowViaGraphql,
  enrollContactInWorkflowViaGraphql,
  getWorkflowEnrollmentsViaGraphql,
  getWorkflowsViaGraphql,
  retryWorkflowEnrollmentViaGraphql,
  updateWorkflowViaGraphql,
} from './workflowsGraphql';
import {
  isWorkflowEnrollmentsGraphqlEnabled, isWorkflowGraphqlMutationsEnabled, isWorkflowGraphqlReadsEnabled,
} from './graphqlClient';

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
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('workflow-csrf');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('keeps workflow reads and mutations independently default-off', () => {
    vi.stubEnv('VITE_WORKFLOW_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_WORKFLOW_MUTATIONS_GRAPHQL', 'false');
    vi.stubEnv('VITE_WORKFLOW_ENROLLMENTS_GRAPHQL', 'false');
    expect(isWorkflowGraphqlReadsEnabled()).toBe(false);
    expect(isWorkflowGraphqlMutationsEnabled()).toBe(false);
    expect(isWorkflowEnrollmentsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_WORKFLOW_READS_GRAPHQL', 'true');
    vi.stubEnv('VITE_WORKFLOW_ENROLLMENTS_GRAPHQL', 'true');
    expect(isWorkflowGraphqlReadsEnabled()).toBe(true);
    expect(isWorkflowGraphqlMutationsEnabled()).toBe(false);
    expect(isWorkflowEnrollmentsGraphqlEnabled()).toBe(true);
  });

  it('walks every page and maps filters, steps, and enrollment counts to the REST contract', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { workflows: {
        nodes: [workflow], pageInfo: { total: 2, hasNextPage: true },
      } } }))
      .mockResolvedValueOnce(response({ data: { workflows: {
        nodes: [{ ...workflow, id: 10, name: 'Follow up', steps: [] }],
        pageInfo: { total: 2, hasNextPage: false },
      } } }));
    const result = await getWorkflowsViaGraphql(4, {
      trigger_type: 'contact_added', is_active: false, search: 'welcome',
    });
    expect(result.total).toBe(2);
    expect(result.workflows[0]).toMatchObject({
      id: 9, organization_id: 4, trigger_type: 'contact_added', step_count: 1,
      enrollment_stats: { active_count: 0, total_count: 0 },
      steps: [{ workflow_id: 9, step_order: 1, step_type: 'add_tag' }],
    });
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
    expect(bodies[0].variables.filter).toEqual({ triggerType: 'contact_added', isActive: false, search: 'welcome' });
  });

  it('maps protected definition writes and verifies delete postconditions', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createWorkflow: workflow } }))
      .mockResolvedValueOnce(response({ data: { updateWorkflow: workflow } }))
      .mockResolvedValueOnce(response({ data: { activateWorkflow: { ...workflow, isActive: true } } }))
      .mockResolvedValueOnce(response({ data: { deleteWorkflow: { deletedId: 9, success: true } } }));
    await createWorkflowViaGraphql({
      organization_id: 4, name: 'Welcome', trigger_type: 'contact_added', trigger_config: {},
      steps: [{ step_order: 1, step_type: 'condition', step_config: {}, condition_config: {}, true_branch_step: 2 }],
    });
    await updateWorkflowViaGraphql(9, { description: null, steps: [] }, 4);
    await activateWorkflowViaGraphql(9, 4);
    await deleteWorkflowViaGraphql(9, 4);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables.input).toEqual({
      name: 'Welcome', triggerType: 'contact_added', triggerConfig: {},
      steps: [{ stepType: 'condition', stepConfig: {}, conditionConfig: {}, trueBranchStep: 2 }],
    });
    expect(bodies[1].variables).toEqual({ id: 9, input: { description: null, steps: [] } });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
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
