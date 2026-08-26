import {
  disconnectStripeViaGraphql,
  startStripeConnectViaGraphql,
} from './stripeConnectGraphql';

export const initiateStripeConnect = async (
  organizationId?: number,
  returnUrl?: string,
): Promise<{ authUrl: string }> => {
  return startStripeConnectViaGraphql(organizationId, returnUrl);
};

export const disconnectStripeConnect = async (
  organizationId?: number,
): Promise<{ success: boolean }> => {
  return disconnectStripeViaGraphql(organizationId);
};
