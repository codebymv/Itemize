import { ApolloServer } from '@apollo/server';
import { graphqlParseOptions, graphqlValidationRules, graphqlRequestLimitsPlugin } from './graphql-request-limits';

describe('GraphQL resource limits', () => {
  let server: ApolloServer;
  const resolveValue = jest.fn(() => 'ok');
  beforeEach(() => {
    resolveValue.mockClear();
    server = new ApolloServer({
      typeDefs: 'type Query { value: String, node: Node } type Node { value: String, child: Node }',
      resolvers: { Query: { value: resolveValue, node: () => ({}) } },
      parseOptions: graphqlParseOptions,
      validationRules: graphqlValidationRules,
      plugins: [graphqlRequestLimitsPlugin],
    });
  });
  afterEach(async () => { await server.stop(); });

  it('allows normal variable-bearing operations and cached documents', async () => {
    const query = 'query Test($show: Boolean!) { value @include(if: $show) }';
    for (const show of [true, false, true]) {
      const result = await server.executeOperation({ query, variables: { show } });
      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') expect(result.body.singleResult.errors).toBeUndefined();
    }
    expect(resolveValue).toHaveBeenCalledTimes(2);
  });

  it('rejects alias amplification before any resolver runs', async () => {
    const query = `{ ${Array.from({ length: 1_001 }, (_, i) => `v${i}: value`).join(' ')} }`;
    const result = await server.executeOperation({ query });
    expect(result.body.kind).toBe('single');
    if (result.body.kind === 'single') expect(result.body.singleResult.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
    expect(resolveValue).not.toHaveBeenCalled();
  });

  it('rejects recursive selections through fragments', async () => {
    const result = await server.executeOperation({
      query: '{ node { ...A } } fragment A on Node { child { ...B } } fragment B on Node { child { child { child { value } } } }',
    });
    if (result.body.kind === 'single') expect(result.body.singleResult.errors?.[0].extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
    else throw new Error('Expected a single response');
  });

  it('bounds parsing before expensive validation', async () => {
    const result = await server.executeOperation({ query: `{ ${'value '.repeat(10_001)} }` });
    if (result.body.kind === 'single') expect(result.body.singleResult.errors?.[0].extensions?.code).toBe('GRAPHQL_PARSE_FAILED');
    else throw new Error('Expected a single response');
    expect(resolveValue).not.toHaveBeenCalled();
  });
});
