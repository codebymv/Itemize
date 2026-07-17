import { GraphQLError } from 'graphql';
import {
  createGraphqlObservabilityPlugin,
  GraphqlOperationSink,
} from './graphql-observability.plugin';

describe('GraphQL observability plugin', () => {
  const start = async (sink: GraphqlOperationSink, request: Record<string, unknown>) => {
    const plugin = createGraphqlObservabilityPlugin(sink);
    const listener = await plugin.requestDidStart?.({
      request,
      contextValue: { req: { requestId: 'correlated-request' } },
    } as never);
    if (!listener) throw new Error('Expected a request listener');
    return listener;
  };

  it('emits a metric-ready success event without query variables', async () => {
    const sink = jest.fn<ReturnType<GraphqlOperationSink>, Parameters<GraphqlOperationSink>>();
    const listener = await start(sink, {
      operationName: 'CreateContact',
      variables: { email: 'private@test.itemize' },
    });

    await listener.didResolveOperation?.({
      operationName: 'CreateContact',
      operation: { operation: 'mutation' },
    } as never);
    await listener.willSendResponse?.({
      contextValue: { req: { requestId: 'correlated-request' } },
      response: {
        http: { status: 200 },
        body: { kind: 'single', singleResult: { data: { createContact: { id: 1 } } } },
      },
    } as never);

    expect(sink).toHaveBeenCalledWith('log', expect.objectContaining({
      event: 'graphql_operation_completed',
      layer: 'nestjs',
      transport: 'graphql',
      requestId: 'correlated-request',
      operationName: 'CreateContact',
      operationType: 'mutation',
      statusCode: 200,
      outcome: 'success',
      operationCount: 1,
      errorCount: 0,
      errorCodes: [],
      durationMs: expect.any(Number),
    }));
    expect(JSON.stringify(sink.mock.calls)).not.toContain('private@test.itemize');
  });

  it('deduplicates stable GraphQL error codes and raises the log severity', async () => {
    const sink = jest.fn<ReturnType<GraphqlOperationSink>, Parameters<GraphqlOperationSink>>();
    const listener = await start(sink, { operationName: 'UpdateContact' });
    const forbidden = new GraphQLError('Forbidden', {
      extensions: { code: 'FORBIDDEN' },
    });

    await listener.didResolveOperation?.({
      operationName: 'UpdateContact',
      operation: { operation: 'mutation' },
    } as never);
    await listener.didEncounterErrors?.({ errors: [forbidden, forbidden] } as never);
    await listener.willSendResponse?.({
      contextValue: { req: { requestId: 'correlated-request' } },
      response: {
        http: { status: 200 },
        body: {
          kind: 'single',
          singleResult: { errors: [forbidden.toJSON()], data: null },
        },
      },
    } as never);

    expect(sink).toHaveBeenCalledWith('warn', expect.objectContaining({
      operationName: 'UpdateContact',
      outcome: 'error',
      errorCount: 1,
      errorCodes: ['FORBIDDEN'],
    }));
  });

  it('marks internal failures as error-level events', async () => {
    const sink = jest.fn<ReturnType<GraphqlOperationSink>, Parameters<GraphqlOperationSink>>();
    const listener = await start(sink, {});
    const internal = new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });

    await listener.didEncounterErrors?.({ errors: [internal] } as never);
    await listener.willSendResponse?.({
      contextValue: { req: {} },
      response: {
        http: { status: 200 },
        body: { kind: 'single', singleResult: { errors: [internal.toJSON()] } },
      },
    } as never);

    expect(sink).toHaveBeenCalledWith('error', expect.objectContaining({
      requestId: null,
      operationName: 'anonymous',
      operationType: 'unknown',
      errorCodes: ['INTERNAL_SERVER_ERROR'],
    }));
  });
});
