import { graphqlMutationRequest } from './graphqlClient';

export const startStripeConnectViaGraphql = async (
  organizationId?: number,
  returnUrl?: string,
): Promise<{ authUrl: string }> => {
  const response = await graphqlMutationRequest<
    { startStripeConnect: string },
    { returnUrl?: string }
  >(
    `mutation StartStripeConnect($returnUrl: String) {
      startStripeConnect(returnUrl: $returnUrl)
    }`,
    returnUrl ? { returnUrl } : {},
    organizationId,
  );
  return { authUrl: response.startStripeConnect };
};

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
