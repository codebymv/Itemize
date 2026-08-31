export const workflowQueryKeys = {
  queues: (organizationId: number | null) => ['workflows', organizationId] as const,
  queue: (
    organizationId: number | null,
    query: { search: string; trigger: string; status: string; page: number; limit: number },
  ) => ['workflows', organizationId, query] as const,
  detail: (organizationId: number | null, workflowId: number | null) => [
    'workflow', organizationId, workflowId,
  ] as const,
  enrollments: (organizationId: number | null, workflowId: number | null) => [
    'workflow-enrollments', organizationId, workflowId,
  ] as const,
  enrollmentPage: (
    organizationId: number | null,
    workflowId: number | null,
    page: number,
    limit: number,
  ) => [...workflowQueryKeys.enrollments(organizationId, workflowId), { page, limit }] as const,
};
