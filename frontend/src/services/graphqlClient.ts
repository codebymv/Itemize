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
  readonly reason?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string, reason?: string) {
    super(message);
    this.name = 'GraphqlRequestError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

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

export const isWorkflowGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_WORKFLOW_READS_GRAPHQL === 'true';

export const isWorkflowGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_WORKFLOW_MUTATIONS_GRAPHQL === 'true';

export const isWorkflowEnrollmentsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_WORKFLOW_ENROLLMENTS_GRAPHQL === 'true';

export const isCampaignGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_CAMPAIGN_READS_GRAPHQL === 'true';

export const isCampaignGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_CAMPAIGN_MUTATIONS_GRAPHQL === 'true';

export const isCampaignAudiencePreviewGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_CAMPAIGN_AUDIENCE_PREVIEW_GRAPHQL === 'true';

export const isCampaignRecipientReadsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_CAMPAIGN_RECIPIENT_READS_GRAPHQL === 'true';

export const isReputationReviewsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_REVIEWS_GRAPHQL === 'true';

export const isReputationAnalyticsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_ANALYTICS_GRAPHQL === 'true';

export const isReputationRequestManagementGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL === 'true';

export const isReputationRequestDeliveryGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_REQUEST_DELIVERY_GRAPHQL === 'true';

export const isReputationPlatformsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_PLATFORMS_GRAPHQL === 'true';

export const isReputationSettingsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_SETTINGS_GRAPHQL === 'true';

export const isReputationWidgetsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_REPUTATION_WIDGETS_GRAPHQL === 'true';

export const isSignatureDocumentGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_DOCUMENT_READS_GRAPHQL === 'true';

export const isSignatureTemplateGraphqlReadsEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_TEMPLATE_READS_GRAPHQL === 'true';

export const isSignatureDocumentGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_DOCUMENT_MUTATIONS_GRAPHQL === 'true';

export const isSignatureTemplateGraphqlMutationsEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_TEMPLATE_MUTATIONS_GRAPHQL === 'true';

export const isSignatureCancellationGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_CANCELLATION_GRAPHQL === 'true';

export const isSignatureEmailPreviewGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_EMAIL_PREVIEW_GRAPHQL === 'true';

export const isSignatureDeliveryGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_DELIVERY_GRAPHQL === 'true';

export const isSignatureFileMutationsGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_SIGNATURE_FILE_MUTATIONS_GRAPHQL === 'true';

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
  refreshOnUnauthenticated = true,
): Promise<TData> => {
  let result = await executeGraphqlRequest<TData, TVariables>(
    query,
    variables,
    organizationId,
    csrfToken,
  );
  if (
    refreshOnUnauthenticated &&
    result.payload.errors?.[0]?.extensions?.code === 'UNAUTHENTICATED'
  ) {
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
      typeof firstError?.extensions?.reason === 'string'
        ? firstError.extensions.reason
        : undefined,
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

export const graphqlPublicRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
): Promise<TData> => runGraphqlRequest(
  query,
  variables,
  undefined,
  undefined,
  false,
);
