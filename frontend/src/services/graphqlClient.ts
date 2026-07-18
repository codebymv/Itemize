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
