import { fetchCsrfToken, getApiUrl, refreshAuthenticatedSession } from '@/lib/api';

type GraphqlErrorPayload = {
  message?: string;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
};

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: GraphqlErrorPayload[];
};

type GraphqlResult<TData> = {
  response: Response;
  payload: GraphqlResponse<TData>;
};

export class GraphqlRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'GraphqlRequestError';
    this.status = status;
    this.code = code;
  }
}

export const isContactGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_READS_GRAPHQL === 'true';

export const isContactGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_MUTATIONS_GRAPHQL === 'true';

export const isContactGraphqlBulkMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_BULK_MUTATIONS_GRAPHQL === 'true';

export const isContactGraphqlActivitiesEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_ACTIVITIES_GRAPHQL === 'true';

export const isContactGraphqlContentEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_CONTENT_GRAPHQL === 'true';

export const isPipelineGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_PIPELINE_READS_GRAPHQL === 'true';

export const isPipelineGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_PIPELINE_MUTATIONS_GRAPHQL === 'true';

export const isDealGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_DEAL_READS_GRAPHQL === 'true';

export const isDealGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_DEAL_MUTATIONS_GRAPHQL === 'true';

export const isFormGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_FORM_READS_GRAPHQL === 'true';

export const isFormGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_FORM_MUTATIONS_GRAPHQL === 'true';

export const isFormSubmissionGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_FORM_SUBMISSIONS_GRAPHQL === 'true';

export const isOnboardingGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_ONBOARDING_READS_GRAPHQL === 'true';

export const isOnboardingGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_ONBOARDING_MUTATIONS_GRAPHQL === 'true';

export const isCategoryGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_CATEGORY_READS_GRAPHQL === 'true';

export const isCategoryGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CATEGORY_MUTATIONS_GRAPHQL === 'true';

export const isOrganizationGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_ORGANIZATION_READS_GRAPHQL === 'true';

export const isOrganizationGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_ORGANIZATION_MUTATIONS_GRAPHQL === 'true';

export const isCalendarGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_CALENDAR_READS_GRAPHQL === 'true';

export const isCalendarGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CALENDAR_MUTATIONS_GRAPHQL === 'true';

export const isCalendarGraphqlAvailabilityMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL === 'true';

export const isCalendarIntegrationsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_CALENDAR_INTEGRATIONS_GRAPHQL === 'true';

export const isBookingGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_BOOKING_READS_GRAPHQL === 'true';

export const isBookingGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_BOOKING_MUTATIONS_GRAPHQL === 'true';

export const isBookingSchedulingGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_BOOKING_SCHEDULING_MUTATIONS_GRAPHQL === 'true';

export const isProductGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_PRODUCT_READS_GRAPHQL === 'true';

export const isProductGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_PRODUCT_MUTATIONS_GRAPHQL === 'true';

export const isInvoiceBusinessGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_BUSINESS_READS_GRAPHQL === 'true';

export const isInvoiceBusinessGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_BUSINESS_MUTATIONS_GRAPHQL === 'true';

export const isInvoiceSettingsGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_SETTINGS_READS_GRAPHQL === 'true';

export const isInvoiceSettingsGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_SETTINGS_MUTATIONS_GRAPHQL === 'true';

export const isInvoiceEmailPreviewGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_EMAIL_PREVIEW_GRAPHQL === 'true';

export const isInvoiceGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_READS_GRAPHQL === 'true';

export const isInvoiceGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_MUTATIONS_GRAPHQL === 'true';

export const isInvoiceGraphqlSendEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_SEND_GRAPHQL === 'true';

export const isInvoicePaymentLinkGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_INVOICE_PAYMENT_LINK_GRAPHQL === 'true';

export const isEstimateGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_ESTIMATE_READS_GRAPHQL === 'true';

export const isEstimateGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_ESTIMATE_MUTATIONS_GRAPHQL === 'true';

export const isEstimateGraphqlConversionEnabled = (): boolean =>
  import.meta.env.VITE_ESTIMATE_CONVERSION_GRAPHQL === 'true';

export const isEstimateGraphqlSendEnabled = (): boolean =>
  import.meta.env.VITE_ESTIMATE_SEND_GRAPHQL === 'true';

export const isRecurringInvoiceGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_RECURRING_INVOICE_READS_GRAPHQL === 'true';

export const isRecurringInvoiceGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_RECURRING_INVOICE_MUTATIONS_GRAPHQL === 'true';

export const isRecurringInvoiceGraphqlLifecycleEnabled = (): boolean =>
  import.meta.env.VITE_RECURRING_INVOICE_LIFECYCLE_GRAPHQL === 'true';

export const isRecurringInvoiceGraphqlCloneEnabled = (): boolean =>
  import.meta.env.VITE_RECURRING_INVOICE_CLONE_GRAPHQL === 'true';

export const isRecurringInvoiceGraphqlGenerationEnabled = (): boolean =>
  import.meta.env.VITE_RECURRING_INVOICE_GENERATION_GRAPHQL === 'true';

export const isPaymentGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_PAYMENT_READS_GRAPHQL === 'true';

export const isPaymentGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_PAYMENT_MUTATIONS_GRAPHQL === 'true';

export const isWorkspaceListGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_LIST_READS_GRAPHQL === 'true';

export const isWorkspaceListGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL === 'true';

export const isWorkspaceNoteGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_NOTE_READS_GRAPHQL === 'true';

export const isWorkspaceNoteGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL === 'true';

export const isWorkspaceWhiteboardGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_WHITEBOARD_READS_GRAPHQL === 'true';

export const isWorkspaceWhiteboardGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_WORKSPACE_WHITEBOARD_MUTATIONS_GRAPHQL === 'true';

export const isDashboardAnalyticsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_DASHBOARD_ANALYTICS_GRAPHQL === 'true';

export const isContactTrendsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_CONTACT_TRENDS_GRAPHQL === 'true';

export const isDealPerformanceGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_DEAL_PERFORMANCE_GRAPHQL === 'true';

export const isBookingAnalyticsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_BOOKING_ANALYTICS_GRAPHQL === 'true';

export const isCommunicationStatsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_COMMUNICATION_STATS_GRAPHQL === 'true';

export const isWorkflowPerformanceGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_WORKFLOW_PERFORMANCE_GRAPHQL === 'true';

export const isEmailTemplateGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_EMAIL_TEMPLATE_READS_GRAPHQL === 'true';

export const isEmailTemplateGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_EMAIL_TEMPLATE_MUTATIONS_GRAPHQL === 'true';

export const isSmsTemplateGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_SMS_TEMPLATE_READS_GRAPHQL === 'true';

export const isSmsTemplateGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_SMS_TEMPLATE_MUTATIONS_GRAPHQL === 'true';

export const getGraphqlUrl = (): string => {
  const configured = import.meta.env.VITE_GRAPHQL_URL?.trim();
  if (configured) return configured;
  return `${getApiUrl().replace(/\/$/, '')}/graphql`;
};

const executeGraphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
  csrfToken?: string,
): Promise<GraphqlResult<TData>> => {
  const response = await fetch(getGraphqlUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(organizationId
        ? { 'x-organization-id': organizationId.toString() }
        : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  try {
    return {
      response,
      payload: (await response.json()) as GraphqlResponse<TData>,
    };
  } catch {
    throw new GraphqlRequestError(
      'GraphQL service returned an invalid response',
      response.status,
    );
  }
};

const runGraphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
  csrfToken?: string,
): Promise<TData> => {
  let result = await executeGraphqlRequest<TData, TVariables>(
    query,
    variables,
    organizationId,
    csrfToken,
  );
  if (result.payload.errors?.[0]?.extensions?.code === 'UNAUTHENTICATED') {
    try {
      await refreshAuthenticatedSession();
    } catch (error) {
      const status = error && typeof error === 'object'
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
      throw new GraphqlRequestError('Session refresh failed', status ?? 401, 'UNAUTHENTICATED');
    }
    result = await executeGraphqlRequest<TData, TVariables>(
      query,
      variables,
      organizationId,
      csrfToken,
    );
  }

  const firstError = result.payload.errors?.[0];
  if (!result.response.ok || firstError || result.payload.data === undefined) {
    throw new GraphqlRequestError(
      firstError?.message || `GraphQL request failed with status ${result.response.status}`,
      result.response.status,
      firstError?.extensions?.code,
    );
  }

  return result.payload.data;
};

export const graphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
): Promise<TData> => runGraphqlRequest(query, variables, organizationId);

export const graphqlMutationRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
): Promise<TData> => {
  const csrfToken = await fetchCsrfToken();
  return runGraphqlRequest(query, variables, organizationId, csrfToken);
};
