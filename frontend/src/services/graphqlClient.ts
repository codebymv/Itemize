import { getApiUrl, refreshAuthenticatedSession } from '@/lib/api';

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

export const getGraphqlUrl = (): string => {
  const configured = import.meta.env.VITE_GRAPHQL_URL?.trim();
  if (configured) return configured;
  return `${getApiUrl().replace(/\/$/, '')}/graphql`;
};

const executeGraphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
): Promise<GraphqlResult<TData>> => {
  const response = await fetch(getGraphqlUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(organizationId
        ? { 'x-organization-id': organizationId.toString() }
        : {}),
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

export const graphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
): Promise<TData> => {
  let result = await executeGraphqlRequest<TData, TVariables>(
    query,
    variables,
    organizationId,
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
