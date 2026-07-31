import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateWorkflow,
  cancelEnrollment,
  createWorkflow,
  deactivateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  enrollContact,
  getWorkflow,
  getWorkflowEnrollments,
  getWorkflows,
  pauseEnrollment,
  resumeEnrollment,
  retryEnrollment,
  updateWorkflow,
} from './automationsApi';
import * as graphql from './workflowsGraphql';

vi.mock('./workflowsGraphql', () => ({
  activateWorkflowViaGraphql: vi.fn(),
  cancelWorkflowEnrollmentViaGraphql: vi.fn(),
  createWorkflowViaGraphql: vi.fn(),
  deactivateWorkflowViaGraphql: vi.fn(),
  deleteWorkflowViaGraphql: vi.fn(),
  duplicateWorkflowViaGraphql: vi.fn(),
  enrollContactInWorkflowViaGraphql: vi.fn(),
  getWorkflowEnrollmentsViaGraphql: vi.fn(),
  getWorkflowViaGraphql: vi.fn(),
  getWorkflowsViaGraphql: vi.fn(),
  pauseWorkflowEnrollmentViaGraphql: vi.fn(),
  resumeWorkflowEnrollmentViaGraphql: vi.fn(),
  retryWorkflowEnrollmentViaGraphql: vi.fn(),
  updateWorkflowViaGraphql: vi.fn(),
}));

describe('workflow API GraphQL dispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes every workflow definition operation through GraphQL', async () => {
    const created = {
      organization_id: 4,
      name: 'Welcome',
      trigger_type: 'contact_added' as const,
      steps: [],
    };
    const updated = { organization_id: 4, name: 'Renamed', steps: [] };

    await getWorkflows(4, { search: 'welcome', is_active: false });
    await getWorkflow(9, 4);
    await createWorkflow(created);
    await updateWorkflow(9, updated);
    await deleteWorkflow(9, 4);
    await activateWorkflow(9, 4);
    await deactivateWorkflow(9, 4);
    await duplicateWorkflow(9, 4);

    expect(graphql.getWorkflowsViaGraphql).toHaveBeenCalledWith(
      4, { search: 'welcome', is_active: false },
    );
    expect(graphql.getWorkflowViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(graphql.createWorkflowViaGraphql).toHaveBeenCalledWith(created);
    expect(graphql.updateWorkflowViaGraphql).toHaveBeenCalledWith(
      9, { name: 'Renamed', steps: [] }, 4,
    );
    expect(graphql.deleteWorkflowViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(graphql.activateWorkflowViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(graphql.deactivateWorkflowViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(graphql.duplicateWorkflowViaGraphql).toHaveBeenCalledWith(9, 4);
  });

  it('routes every workflow enrollment operation through GraphQL', async () => {
    const page = { status: 'active', page: 2, limit: 25 };

    await enrollContact(9, 22, 4, { source: 'manual' });
    await getWorkflowEnrollments(9, 4, page);
    await cancelEnrollment(9, 14, 4);
    await pauseEnrollment(9, 14, 4);
    await resumeEnrollment(9, 14, 4);
    await retryEnrollment(9, 14, 4);

    expect(graphql.enrollContactInWorkflowViaGraphql).toHaveBeenCalledWith(
      9, 22, 4, { source: 'manual' },
    );
    expect(graphql.getWorkflowEnrollmentsViaGraphql).toHaveBeenCalledWith(9, 4, page);
    expect(graphql.cancelWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(graphql.pauseWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(graphql.resumeWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
    expect(graphql.retryWorkflowEnrollmentViaGraphql).toHaveBeenCalledWith(9, 14, 4);
  });

  it('requires the organization context for workflow updates', async () => {
    await expect(updateWorkflow(9, { name: 'Renamed' })).rejects.toThrow(
      'organization_id is required for GraphQL workflow updates',
    );
    expect(graphql.updateWorkflowViaGraphql).not.toHaveBeenCalled();
  });
});
