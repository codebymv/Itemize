import { getApiUrl } from '@/lib/api';

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

export const graphqlRequest = async <TData, TVariables extends object>(
  query: string,
  variables: TVariables,
  organizationId?: number,
): Promise<TData> => {
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

  let payload: GraphqlResponse<TData>;
  try {
    payload = (await response.json()) as GraphqlResponse<TData>;
  } catch {
    throw new GraphqlRequestError(
      'GraphQL service returned an invalid response',
      response.status,
    );
  }

  const firstError = payload.errors?.[0];
  if (!response.ok || firstError || payload.data === undefined) {
    throw new GraphqlRequestError(
      firstError?.message || `GraphQL request failed with status ${response.status}`,
      response.status,
      firstError?.extensions?.code,
    );
  }

  return payload.data;
};
