import { graphqlMutationRequest } from './graphqlClient';

export const disconnectStripeViaGraphql = async (
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const response = await graphqlMutationRequest<
    { disconnectStripe: boolean },
    Record<string, never>
  >(
    `mutation DisconnectStripe {
      disconnectStripe
    }`,
    {},
    organizationId,
  );
  return { success: response.disconnectStripe };
};
