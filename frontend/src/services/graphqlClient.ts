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
  signal?: AbortSignal,
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
    signal,
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
  signal?: AbortSignal,
): Promise<TData> => {
  let result = await executeGraphqlRequest<TData, TVariables>(
    query,
    variables,
    organizationId,
    csrfToken,
    signal,
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
      signal,
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
  signal?: AbortSignal,
): Promise<TData> => runGraphqlRequest(
  query,
  variables,
  organizationId,
  undefined,
  true,
  signal,
);

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
