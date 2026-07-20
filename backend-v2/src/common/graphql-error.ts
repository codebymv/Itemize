import { GraphQLError, GraphQLFormattedError } from 'graphql';

export type ItemizeGraphqlErrorCode =
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_FOUND'
  | 'ORGANIZATION_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNAUTHENTICATED';

type ErrorDetails = {
  reason?: string;
  field?: string;
  requestId?: string;
  [key: string]: unknown;
};

export const itemizeGraphqlError = (
  message: string,
  code: ItemizeGraphqlErrorCode,
  details: ErrorDetails = {},
): GraphQLError =>
  new GraphQLError(message, {
    extensions: {
      code,
      ...details,
    },
  });

export const formatItemizeGraphqlError = (error: GraphQLFormattedError) => {
  const sourceExtensions = error.extensions ?? {};
  const code = String(sourceExtensions.code ?? 'INTERNAL_SERVER_ERROR');
  const safeMessage =
    code === 'INTERNAL_SERVER_ERROR'
      ? 'An unexpected error occurred'
      : error.message;

  const extensions: Record<string, unknown> = { code };
  for (const key of [
    'reason',
    'field',
    'requestId',
    'current',
    'currentUpdatedAt',
    'actualStatus',
    'limit',
    'plan',
  ] as const) {
    if (sourceExtensions[key] !== undefined) {
      extensions[key] = sourceExtensions[key];
    }
  }

  return {
    message: safeMessage,
    ...(error.locations ? { locations: error.locations } : {}),
    ...(error.path ? { path: error.path } : {}),
    extensions,
  };
};
