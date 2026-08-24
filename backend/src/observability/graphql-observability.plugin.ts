import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Request, Response } from 'express';
import { OperationTypeNode } from 'graphql';
import { RequestWithRequestId } from '../request-context/request-context.middleware';

type GraphqlContext = {
  req: RequestWithRequestId;
  res: Response;
};

export type GraphqlOperationEvent = {
  event: 'graphql_operation_completed';
  layer: 'nestjs';
  transport: 'graphql';
  requestId: string | null;
  operationName: string;
  operationType: OperationTypeNode | 'unknown';
  statusCode: number;
  durationMs: number;
  outcome: 'success' | 'error';
  operationCount: 1;
  errorCount: 0 | 1;
  errorCodes: string[];
};

export type GraphqlOperationSink = (
  level: 'log' | 'warn' | 'error',
  event: GraphqlOperationEvent,
) => void;

const defaultSink: GraphqlOperationSink = (level, event) => {
  const record = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: level === 'log' ? 'info' : level,
    service: 'itemize-graphql-api',
    ...event,
  })}\n`;
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(record);
};

const errorCode = (error: { extensions?: Readonly<Record<string, unknown>> }): string =>
  typeof error.extensions?.code === 'string'
    ? error.extensions.code
    : 'UNKNOWN';

const severityFor = (
  statusCode: number,
  codes: string[],
): 'log' | 'warn' | 'error' => {
  if (
    statusCode >= 500
    || codes.includes('INTERNAL_SERVER_ERROR')
    || codes.includes('SERVICE_UNAVAILABLE')
  ) {
    return 'error';
  }
  return codes.length > 0 ? 'warn' : 'log';
};

export const createGraphqlObservabilityPlugin = (
  sink: GraphqlOperationSink = defaultSink,
): ApolloServerPlugin<GraphqlContext> => ({
  async requestDidStart(initialContext) {
    const startedAt = process.hrtime.bigint();
    let operationName = initialContext.request.operationName || 'anonymous';
    let operationType: GraphqlOperationEvent['operationType'] = 'unknown';
    const codes = new Set<string>();

    const listener: GraphQLRequestListener<GraphqlContext> = {
      async didResolveOperation(context) {
        operationName = context.operationName || 'anonymous';
        operationType = context.operation?.operation || 'unknown';
      },
      async didEncounterErrors(context) {
        context.errors.forEach((error) => codes.add(errorCode(error)));
      },
      async willSendResponse(context) {
        if (context.response.body.kind === 'single') {
          context.response.body.singleResult.errors?.forEach((error) => {
            codes.add(errorCode(error));
          });
        }

        const errorCodes = [...codes].sort();
        const statusCode = context.response.http.status || 200;
        if (statusCode >= 400 && errorCodes.length === 0) {
          errorCodes.push('UNKNOWN');
        }
        const event: GraphqlOperationEvent = {
          event: 'graphql_operation_completed',
          layer: 'nestjs',
          transport: 'graphql',
          requestId: context.contextValue.req.requestId || null,
          operationName,
          operationType,
          statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
          outcome: errorCodes.length > 0 ? 'error' : 'success',
          operationCount: 1,
          errorCount: errorCodes.length > 0 ? 1 : 0,
          errorCodes,
        };

        sink(severityFor(statusCode, errorCodes), event);
      },
    };

    return listener;
  },
});
