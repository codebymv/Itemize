import type { Workflow, WorkflowEnrollment, WorkflowStats, WorkflowStep } from './automationsApi';
import { GraphqlRequestError, graphqlMutationRequest, graphqlRequest } from './graphqlClient';

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
  createdAt: string; updatedAt: string; steps?: GraphqlWorkflowStep[]; stepCount: number;
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

type GraphqlWorkflowEnrollment = {
  id: number; workflowId: number; contactId: number; currentStep: number; status: WorkflowEnrollment['status'];
  triggerData: Record<string, unknown>; context: Record<string, unknown>; errorMessage: string | null;
  enrolledAt: string; nextActionAt: string | null; completedAt: string | null;
  firstName: string | null; lastName: string | null; email: string | null; company: string | null;
};

const fields = `
  id organizationId name description triggerType triggerConfig scheduledContactId
  nextTriggerAt lastTriggeredAt isActive stats createdById createdByName createdAt updatedAt
  stepCount activeEnrollments affectedEnrollments
  enrollmentStats { activeCount completedCount failedCount totalCount }
  steps { id workflowId stepOrder stepType stepConfig conditionConfig trueBranchStep falseBranchStep }
`;
const listFields = `
  id organizationId name description triggerType triggerConfig scheduledContactId
  nextTriggerAt lastTriggeredAt isActive stats createdById createdByName createdAt updatedAt
  stepCount activeEnrollments affectedEnrollments
  enrollmentStats { activeCount completedCount failedCount totalCount }
`;
const enrollmentFields = `
  id workflowId contactId currentStep status triggerData context errorMessage
  enrolledAt nextActionAt completedAt firstName lastName email company
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
  steps: (workflow.steps ?? []).map(mapStep), step_count: workflow.stepCount,
  active_enrollments: workflow.activeEnrollments,
  enrollment_stats: {
    active_count: workflow.enrollmentStats.activeCount,
    completed_count: workflow.enrollmentStats.completedCount,
    failed_count: workflow.enrollmentStats.failedCount,
    total_count: workflow.enrollmentStats.totalCount,
  },
});

const mapEnrollment = (enrollment: GraphqlWorkflowEnrollment): WorkflowEnrollment => ({
  id: enrollment.id, workflow_id: enrollment.workflowId, contact_id: enrollment.contactId,
  current_step: enrollment.currentStep, status: enrollment.status,
  trigger_data: enrollment.triggerData, context: enrollment.context,
  ...(enrollment.errorMessage === null ? {} : { error_message: enrollment.errorMessage }),
  enrolled_at: enrollment.enrolledAt,
  ...(enrollment.nextActionAt === null ? {} : { next_action_at: enrollment.nextActionAt }),
  ...(enrollment.completedAt === null ? {} : { completed_at: enrollment.completedAt }),
  ...(enrollment.firstName === null ? {} : { first_name: enrollment.firstName }),
  ...(enrollment.lastName === null ? {} : { last_name: enrollment.lastName }),
  ...(enrollment.email === null ? {} : { email: enrollment.email }),
  ...(enrollment.company === null ? {} : { company: enrollment.company }),
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

type WorkflowQueuePage = {
  nodes: GraphqlWorkflow[];
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
  stats: WorkflowStats;
};
type WorkflowQueueData = { workflows: WorkflowQueuePage };
type WorkflowQueueVariables = {
  filter: { triggerType?: string; isActive?: boolean; search?: string };
  page: { page: number; pageSize: number };
};
type LegacyWorkflowQueueData = {
  workflows: Omit<WorkflowQueuePage, 'stats'>;
  workflowPerformance: {
    summary: {
      totalWorkflows: number; activeWorkflows: number; completedEnrollments: number;
      activeEnrollments: number; failedEnrollments: number;
    };
  };
};
let workflowQueueCapability: 'unknown' | 'current' | 'legacy' = 'unknown';

export const resetWorkflowQueueCapabilities = (): void => {
  workflowQueueCapability = 'unknown';
};

const legacyWorkflowQueue = async (
  variables: WorkflowQueueVariables,
  organizationId: number,
  signal?: AbortSignal,
): Promise<WorkflowQueueData> => {
  const data = await graphqlRequest<LegacyWorkflowQueueData, WorkflowQueueVariables>(
    `query WorkflowDefinitionsLegacy($filter: WorkflowFilterInput, $page: PageInput) {
      workflows(filter: $filter, page: $page) {
        nodes { ${listFields} }
        pageInfo { page pageSize total totalPages }
      }
      workflowPerformance {
        summary {
          totalWorkflows activeWorkflows completedEnrollments activeEnrollments failedEnrollments
        }
      }
    }`,
    variables,
    organizationId,
    signal,
  );
  const summary = data.workflowPerformance.summary;
  return {
    workflows: {
      ...data.workflows,
      stats: {
        total: summary.totalWorkflows,
        active: summary.activeWorkflows,
        inactive: Math.max(0, summary.totalWorkflows - summary.activeWorkflows),
        running: summary.activeEnrollments,
        completed: summary.completedEnrollments,
        failed: summary.failedEnrollments,
      },
    },
  };
};

export const getWorkflowsViaGraphql = async (
  organizationId: number,
  filters: {
    trigger_type?: Workflow['trigger_type']; is_active?: boolean; search?: string;
    page?: number; limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<{
  workflows: Workflow[];
  total: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: WorkflowStats;
}> => {
  const variables: WorkflowQueueVariables = {
    filter: {
      ...(filters.trigger_type === undefined ? {} : { triggerType: filters.trigger_type }),
      ...(filters.is_active === undefined ? {} : { isActive: filters.is_active }),
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    },
    page: { page: filters.page ?? 1, pageSize: filters.limit ?? 20 },
  };
  let data: WorkflowQueueData;
  if (workflowQueueCapability !== 'legacy') {
    try {
      data = await graphqlRequest<WorkflowQueueData, WorkflowQueueVariables>(
        `query WorkflowDefinitions($filter: WorkflowFilterInput, $page: PageInput) {
          workflows(filter: $filter, page: $page) {
            nodes { ${listFields} }
            pageInfo { page pageSize total totalPages }
            stats { total active inactive running completed failed }
          }
        }`,
        variables,
        organizationId,
        signal,
      );
      workflowQueueCapability = 'current';
    } catch (error) {
      if (!(error instanceof GraphqlRequestError) || !/Cannot query field "stats"/.test(error.message)) throw error;
      workflowQueueCapability = 'legacy';
      data = await legacyWorkflowQueue(variables, organizationId, signal);
    }
  } else {
    data = await legacyWorkflowQueue(variables, organizationId, signal);
  }
  const pageInfo = data.workflows.pageInfo;
  return {
    workflows: data.workflows.nodes.map(mapWorkflow),
    total: pageInfo.total,
    pagination: {
      page: pageInfo.page,
      limit: pageInfo.pageSize,
      total: pageInfo.total,
      totalPages: pageInfo.totalPages,
    },
    stats: data.workflows.stats,
  };
};

export const getWorkflowViaGraphql = async (id: number, organizationId: number): Promise<Workflow> => {
  const data = await graphqlRequest<{ workflow: GraphqlWorkflow }, { id: number }>(
    `query Workflow($id: Int!) { workflow(id: $id) { ${fields} } }`, { id }, organizationId,
  );
  return mapWorkflow(data.workflow);
};

export const createWorkflowViaGraphql = async (
  input: WorkflowWriteInput,
  idempotencyKey: string,
): Promise<Workflow> => {
  const data = await graphqlMutationRequest<
    { createWorkflow: GraphqlWorkflow },
    { input: ReturnType<typeof mapCreateInput>; idempotencyKey: string }
  >(
    `mutation CreateWorkflow($input: CreateWorkflowInput!, $idempotencyKey: String!) {
      createWorkflow(input: $input, idempotencyKey: $idempotencyKey) { ${fields} }
    }`,
    { input: mapCreateInput(input), idempotencyKey }, input.organization_id,
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

const activateWorkflowMutation = `mutation ActivateWorkflow($id: Int!) {
  activateWorkflow(id: $id) { ${fields} }
}`;
const deactivateWorkflowMutation = `mutation DeactivateWorkflow($id: Int!) {
  deactivateWorkflow(id: $id) { ${fields} }
}`;
const lifecycleMutation = async (
  document: string,
  operation: 'activateWorkflow' | 'deactivateWorkflow',
  id: number,
  organizationId: number,
) => {
  const data = await graphqlMutationRequest<Record<string, GraphqlWorkflow>, { id: number }>(
    document, { id }, organizationId,
  );
  return mapWorkflow(data[operation]);
};

export const activateWorkflowViaGraphql = (id: number, organizationId: number) => lifecycleMutation(activateWorkflowMutation, 'activateWorkflow', id, organizationId);
export const deactivateWorkflowViaGraphql = (id: number, organizationId: number) => lifecycleMutation(deactivateWorkflowMutation, 'deactivateWorkflow', id, organizationId);
export const duplicateWorkflowViaGraphql = async (
  id: number,
  idempotencyKey: string,
  organizationId: number,
): Promise<Workflow> => {
  const data = await graphqlMutationRequest<
    { duplicateWorkflow: GraphqlWorkflow },
    { id: number; idempotencyKey: string }
  >(
    `mutation DuplicateWorkflow($id: Int!, $idempotencyKey: String!) {
      duplicateWorkflow(id: $id, idempotencyKey: $idempotencyKey) { ${fields} }
    }`,
    { id, idempotencyKey },
    organizationId,
  );
  return mapWorkflow(data.duplicateWorkflow);
};

export const deleteWorkflowViaGraphql = async (id: number, organizationId: number): Promise<void> => {
  const data = await graphqlMutationRequest<{ deleteWorkflow: { deletedId: number; success: boolean } }, { id: number }>(
    'mutation DeleteWorkflow($id: Int!) { deleteWorkflow(id: $id) { deletedId success } }', { id }, organizationId,
  );
  if (!data.deleteWorkflow.success || data.deleteWorkflow.deletedId !== id) throw new Error('GraphQL workflow delete returned an invalid result');
};

export const getWorkflowEnrollmentsViaGraphql = async (
  workflowId: number,
  organizationId: number,
  params: { status?: string; page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{
  enrollments: WorkflowEnrollment[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const data = await graphqlRequest<
    { workflowEnrollments: {
      nodes: GraphqlWorkflowEnrollment[];
      pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
    } },
    { workflowId: number; filter: { status?: string }; page: { page: number; pageSize: number } }
  >(`query WorkflowEnrollments($workflowId: Int!, $filter: WorkflowEnrollmentFilterInput, $page: PageInput) {
    workflowEnrollments(workflowId: $workflowId, filter: $filter, page: $page) {
      nodes { ${enrollmentFields} }
      pageInfo { page pageSize total totalPages }
    }
  }`, {
    workflowId, filter: params.status === undefined ? {} : { status: params.status },
    page: { page, pageSize: limit },
  }, organizationId, signal);
  return {
    enrollments: data.workflowEnrollments.nodes.map(mapEnrollment),
    pagination: {
      page: data.workflowEnrollments.pageInfo.page,
      limit: data.workflowEnrollments.pageInfo.pageSize,
      total: data.workflowEnrollments.pageInfo.total,
      totalPages: data.workflowEnrollments.pageInfo.totalPages,
    },
  };
};

export const enrollContactInWorkflowViaGraphql = async (
  workflowId: number,
  contactId: number,
  organizationId: number,
  triggerData?: Record<string, unknown>,
): Promise<WorkflowEnrollment> => {
  const data = await graphqlMutationRequest<
    { enrollContactInWorkflow: GraphqlWorkflowEnrollment },
    { workflowId: number; input: { contactId: number; triggerData?: Record<string, unknown> } }
  >(`mutation EnrollContactInWorkflow($workflowId: Int!, $input: EnrollContactInWorkflowInput!) {
    enrollContactInWorkflow(workflowId: $workflowId, input: $input) { ${enrollmentFields} }
  }`, {
    workflowId, input: { contactId, ...(triggerData === undefined ? {} : { triggerData }) },
  }, organizationId);
  return mapEnrollment(data.enrollContactInWorkflow);
};

const pauseWorkflowEnrollmentMutation = `mutation PauseWorkflowEnrollment($workflowId: Int!, $enrollmentId: Int!) {
  pauseWorkflowEnrollment(workflowId: $workflowId, enrollmentId: $enrollmentId) { ${enrollmentFields} }
}`;
const resumeWorkflowEnrollmentMutation = `mutation ResumeWorkflowEnrollment($workflowId: Int!, $enrollmentId: Int!) {
  resumeWorkflowEnrollment(workflowId: $workflowId, enrollmentId: $enrollmentId) { ${enrollmentFields} }
}`;
const retryWorkflowEnrollmentMutation = `mutation RetryWorkflowEnrollment($workflowId: Int!, $enrollmentId: Int!) {
  retryWorkflowEnrollment(workflowId: $workflowId, enrollmentId: $enrollmentId) { ${enrollmentFields} }
}`;
const cancelWorkflowEnrollmentMutation = `mutation CancelWorkflowEnrollment($workflowId: Int!, $enrollmentId: Int!) {
  cancelWorkflowEnrollment(workflowId: $workflowId, enrollmentId: $enrollmentId) { ${enrollmentFields} }
}`;

const enrollmentLifecycleMutation = async (
  document: string,
  operation: 'pauseWorkflowEnrollment' | 'resumeWorkflowEnrollment' | 'retryWorkflowEnrollment' | 'cancelWorkflowEnrollment',
  workflowId: number,
  enrollmentId: number,
  organizationId: number,
): Promise<WorkflowEnrollment> => {
  const data = await graphqlMutationRequest<Record<string, GraphqlWorkflowEnrollment>, { workflowId: number; enrollmentId: number }>(
    document, { workflowId, enrollmentId }, organizationId,
  );
  return mapEnrollment(data[operation]);
};

export const pauseWorkflowEnrollmentViaGraphql = (workflowId: number, enrollmentId: number, organizationId: number) =>
  enrollmentLifecycleMutation(pauseWorkflowEnrollmentMutation, 'pauseWorkflowEnrollment', workflowId, enrollmentId, organizationId);
export const resumeWorkflowEnrollmentViaGraphql = (workflowId: number, enrollmentId: number, organizationId: number) =>
  enrollmentLifecycleMutation(resumeWorkflowEnrollmentMutation, 'resumeWorkflowEnrollment', workflowId, enrollmentId, organizationId);
export const retryWorkflowEnrollmentViaGraphql = (workflowId: number, enrollmentId: number, organizationId: number) =>
  enrollmentLifecycleMutation(retryWorkflowEnrollmentMutation, 'retryWorkflowEnrollment', workflowId, enrollmentId, organizationId);
export const cancelWorkflowEnrollmentViaGraphql = (workflowId: number, enrollmentId: number, organizationId: number) =>
  enrollmentLifecycleMutation(cancelWorkflowEnrollmentMutation, 'cancelWorkflowEnrollment', workflowId, enrollmentId, organizationId);
