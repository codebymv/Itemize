import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  activateWorkflowViaGraphql,
  createWorkflowViaGraphql,
  deleteWorkflowViaGraphql,
  getWorkflowsViaGraphql,
  updateWorkflowViaGraphql,
} from './workflowsGraphql';
import { isWorkflowGraphqlMutationsEnabled, isWorkflowGraphqlReadsEnabled } from './graphqlClient';

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
const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('workflow GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('workflow-csrf');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('keeps workflow reads and mutations independently default-off', () => {
    vi.stubEnv('VITE_WORKFLOW_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_WORKFLOW_MUTATIONS_GRAPHQL', 'false');
    expect(isWorkflowGraphqlReadsEnabled()).toBe(false);
    expect(isWorkflowGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_WORKFLOW_READS_GRAPHQL', 'true');
    expect(isWorkflowGraphqlReadsEnabled()).toBe(true);
    expect(isWorkflowGraphqlMutationsEnabled()).toBe(false);
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
});
