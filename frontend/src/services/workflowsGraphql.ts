import type { Workflow, WorkflowStep } from './automationsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlWorkflowStep = {
  id: number; workflowId: number; stepOrder: number; stepType: WorkflowStep['step_type'];
  stepConfig: Record<string, unknown>; conditionConfig: Record<string, unknown> | null;
  trueBranchStep: number | null; falseBranchStep: number | null;
};
type GraphqlWorkflow = {
  id: number; organizationId: number; name: string; description: string | null;
  triggerType: Workflow['trigger_type']; triggerConfig: Record<string, unknown>;
  scheduledContactId: number | null; nextTriggerAt: string | null; lastTriggeredAt: string | null;
  isActive: boolean; stats: Workflow['stats']; createdById: number | null; createdByName: string | null;
  createdAt: string; updatedAt: string; steps: GraphqlWorkflowStep[]; stepCount: number;
  activeEnrollments: number; enrollmentStats: {
    activeCount: number; completedCount: number; failedCount: number; totalCount: number;
  }; affectedEnrollments: number;
};

type WorkflowWriteInput = {
  organization_id?: number; name: string; description?: string | null;
  trigger_type: Workflow['trigger_type']; trigger_config?: Record<string, unknown>;
  steps?: Omit<WorkflowStep, 'id' | 'workflow_id'>[];
};
type WorkflowUpdateInput = Partial<Omit<WorkflowWriteInput, 'organization_id'>>;

const fields = `
  id organizationId name description triggerType triggerConfig scheduledContactId
  nextTriggerAt lastTriggeredAt isActive stats createdById createdByName createdAt updatedAt
  stepCount activeEnrollments affectedEnrollments
  enrollmentStats { activeCount completedCount failedCount totalCount }
  steps { id workflowId stepOrder stepType stepConfig conditionConfig trueBranchStep falseBranchStep }
`;

const mapStep = (step: GraphqlWorkflowStep): WorkflowStep => ({
  id: step.id, workflow_id: step.workflowId, step_order: step.stepOrder,
  step_type: step.stepType, step_config: step.stepConfig,
  condition_config: step.conditionConfig,
  ...(step.trueBranchStep === null ? {} : { true_branch_step: step.trueBranchStep }),
  ...(step.falseBranchStep === null ? {} : { false_branch_step: step.falseBranchStep }),
});

const mapWorkflow = (workflow: GraphqlWorkflow): Workflow => ({
  id: workflow.id, organization_id: workflow.organizationId, name: workflow.name,
  ...(workflow.description === null ? {} : { description: workflow.description }),
  trigger_type: workflow.triggerType, trigger_config: workflow.triggerConfig,
  scheduled_contact_id: workflow.scheduledContactId, next_trigger_at: workflow.nextTriggerAt,
  last_triggered_at: workflow.lastTriggeredAt, is_active: workflow.isActive, stats: workflow.stats,
  ...(workflow.createdById === null ? {} : { created_by: workflow.createdById }),
  ...(workflow.createdByName === null ? {} : { created_by_name: workflow.createdByName }),
  created_at: workflow.createdAt, updated_at: workflow.updatedAt,
  steps: workflow.steps.map(mapStep), step_count: workflow.stepCount,
  active_enrollments: workflow.activeEnrollments,
  enrollment_stats: {
    active_count: workflow.enrollmentStats.activeCount,
    completed_count: workflow.enrollmentStats.completedCount,
    failed_count: workflow.enrollmentStats.failedCount,
    total_count: workflow.enrollmentStats.totalCount,
  },
});

const mapSteps = (steps: WorkflowWriteInput['steps']) => steps?.map((step) => ({
  stepType: step.step_type, stepConfig: step.step_config,
  ...(step.condition_config === undefined ? {} : { conditionConfig: step.condition_config }),
  ...(step.true_branch_step === undefined ? {} : { trueBranchStep: step.true_branch_step }),
  ...(step.false_branch_step === undefined ? {} : { falseBranchStep: step.false_branch_step }),
}));

const mapCreateInput = (input: WorkflowWriteInput) => ({
  name: input.name,
  ...(input.description === undefined ? {} : { description: input.description }),
  triggerType: input.trigger_type,
  ...(input.trigger_config === undefined ? {} : { triggerConfig: input.trigger_config }),
  ...(input.steps === undefined ? {} : { steps: mapSteps(input.steps) }),
});

const mapUpdateInput = (input: WorkflowUpdateInput) => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.description === undefined ? {} : { description: input.description }),
  ...(input.trigger_type === undefined ? {} : { triggerType: input.trigger_type }),
  ...(input.trigger_config === undefined ? {} : { triggerConfig: input.trigger_config }),
  ...(input.steps === undefined ? {} : { steps: mapSteps(input.steps) }),
});

export const getWorkflowsViaGraphql = async (
  organizationId: number,
  filters: { trigger_type?: Workflow['trigger_type']; is_active?: boolean; search?: string } = {},
): Promise<{ workflows: Workflow[]; total: number }> => {
  const workflows: Workflow[] = [];
  let page = 1;
  let total = 0;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await graphqlRequest<
      { workflows: { nodes: GraphqlWorkflow[]; pageInfo: { total: number; hasNextPage: boolean } } },
      { filter: { triggerType?: string; isActive?: boolean; search?: string }; page: { page: number; pageSize: number } }
    >(`query WorkflowDefinitions($filter: WorkflowFilterInput, $page: PageInput) {
      workflows(filter: $filter, page: $page) { nodes { ${fields} } pageInfo { total hasNextPage } }
    }`, {
      filter: {
        ...(filters.trigger_type === undefined ? {} : { triggerType: filters.trigger_type }),
        ...(filters.is_active === undefined ? {} : { isActive: filters.is_active }),
        ...(filters.search === undefined ? {} : { search: filters.search }),
      }, page: { page, pageSize: 100 },
    }, organizationId);
    workflows.push(...data.workflows.nodes.map(mapWorkflow));
    total = data.workflows.pageInfo.total;
    hasNextPage = data.workflows.pageInfo.hasNextPage;
    page += 1;
  }
  return { workflows, total };
};

export const getWorkflowViaGraphql = async (id: number, organizationId: number): Promise<Workflow> => {
  const data = await graphqlRequest<{ workflow: GraphqlWorkflow }, { id: number }>(
    `query Workflow($id: Int!) { workflow(id: $id) { ${fields} } }`, { id }, organizationId,
  );
  return mapWorkflow(data.workflow);
};

export const createWorkflowViaGraphql = async (input: WorkflowWriteInput): Promise<Workflow> => {
  const data = await graphqlMutationRequest<{ createWorkflow: GraphqlWorkflow }, { input: ReturnType<typeof mapCreateInput> }>(
    `mutation CreateWorkflow($input: CreateWorkflowInput!) { createWorkflow(input: $input) { ${fields} } }`,
    { input: mapCreateInput(input) }, input.organization_id,
  );
  return mapWorkflow(data.createWorkflow);
};

export const updateWorkflowViaGraphql = async (
  id: number, input: WorkflowUpdateInput, organizationId: number,
): Promise<Workflow> => {
  const data = await graphqlMutationRequest<
    { updateWorkflow: GraphqlWorkflow }, { id: number; input: ReturnType<typeof mapUpdateInput> }
  >(`mutation UpdateWorkflow($id: Int!, $input: UpdateWorkflowInput!) {
    updateWorkflow(id: $id, input: $input) { ${fields} }
  }`, { id, input: mapUpdateInput(input) }, organizationId);
  return mapWorkflow(data.updateWorkflow);
};

const lifecycleMutation = async (operation: 'activateWorkflow' | 'deactivateWorkflow' | 'duplicateWorkflow', id: number, organizationId: number) => {
  const data = await graphqlMutationRequest<Record<string, GraphqlWorkflow>, { id: number }>(
    `mutation WorkflowLifecycle($id: Int!) { ${operation}(id: $id) { ${fields} } }`, { id }, organizationId,
  );
  return mapWorkflow(data[operation]);
};

export const activateWorkflowViaGraphql = (id: number, organizationId: number) => lifecycleMutation('activateWorkflow', id, organizationId);
export const deactivateWorkflowViaGraphql = (id: number, organizationId: number) => lifecycleMutation('deactivateWorkflow', id, organizationId);
export const duplicateWorkflowViaGraphql = (id: number, organizationId: number) => lifecycleMutation('duplicateWorkflow', id, organizationId);

export const deleteWorkflowViaGraphql = async (id: number, organizationId: number): Promise<void> => {
  const data = await graphqlMutationRequest<{ deleteWorkflow: { deletedId: number; success: boolean } }, { id: number }>(
    'mutation DeleteWorkflow($id: Int!) { deleteWorkflow(id: $id) { deletedId success } }', { id }, organizationId,
  );
  if (!data.deleteWorkflow.success || data.deleteWorkflow.deletedId !== id) throw new Error('GraphQL workflow delete returned an invalid result');
};
