import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { createWorkflow, getWorkflows, updateWorkflow } from './automationsApi';
import {
  createWorkflowViaGraphql,
  getWorkflowsViaGraphql,
  updateWorkflowViaGraphql,
} from './workflowsGraphql';
import {
  isWorkflowGraphqlMutationsEnabled,
  isWorkflowGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('./graphqlClient', () => ({
  isEmailTemplateGraphqlMutationsEnabled: vi.fn(() => false),
  isEmailTemplateGraphqlReadsEnabled: vi.fn(() => false),
  isWorkflowGraphqlMutationsEnabled: vi.fn(),
  isWorkflowGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./workflowsGraphql', () => ({
  activateWorkflowViaGraphql: vi.fn(), createWorkflowViaGraphql: vi.fn(),
  deactivateWorkflowViaGraphql: vi.fn(), deleteWorkflowViaGraphql: vi.fn(),
  duplicateWorkflowViaGraphql: vi.fn(), getWorkflowViaGraphql: vi.fn(),
  getWorkflowsViaGraphql: vi.fn(), updateWorkflowViaGraphql: vi.fn(),
}));

const workflow = {
  id: 9, organization_id: 4, name: 'Welcome', trigger_type: 'contact_added' as const,
  trigger_config: {}, is_active: false, stats: { enrolled: 0, completed: 0, failed: 0 },
  created_at: '2026-07-21T10:00:00Z', updated_at: '2026-07-21T10:00:00Z',
};

describe('workflow API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isWorkflowGraphqlMutationsEnabled).mockReturnValue(false);
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
});
