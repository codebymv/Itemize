import { ApolloServerPlugin } from '@apollo/server';
import { depthLimit } from '@graphile/depth-limit';
import { GraphQLError } from 'graphql';
import { getComplexity, simpleEstimator } from 'graphql-query-complexity';

export const graphqlParseOptions = { maxTokens: 10_000 };
export const graphqlValidationRules = [depthLimit({
  maxDepth: 12,
  maxListDepth: 4,
  maxSelfReferentialDepth: 3,
})];

// Count expanded selections, including aliases and repeated fragments. Run for
// every request (also cached documents), with that request's variable values.
// This bounds selection work; repositories must still cap pagination sizes.
export const graphqlRequestLimitsPlugin: ApolloServerPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ schema, document, request, operationName }) {
        try {
          const complexity = getComplexity({
            schema,
            query: document,
            variables: request.variables,
            operationName: operationName ?? undefined,
            maxQueryNodes: 5_000,
            estimators: [simpleEstimator({ defaultComplexity: 1 })],
          });
          if (complexity <= 1_000) return;
        } catch {
          // Invalid variables or excessive fragment expansion also fail closed.
        }
        throw new GraphQLError('GraphQL request exceeds the allowed complexity or has invalid variables', {
          extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
      },
    };
  },
};
