import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectStripeConnect, initiateStripeConnect } from './stripeConnectApi';
import {
  disconnectStripeViaGraphql,
  startStripeConnectViaGraphql,
} from './stripeConnectGraphql';

vi.mock('./stripeConnectGraphql', () => ({
  disconnectStripeViaGraphql: vi.fn(),
  startStripeConnectViaGraphql: vi.fn(),
}));

describe('stripeConnectApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts hosted onboarding through the tenant-scoped GraphQL mutation', async () => {
    vi.mocked(startStripeConnectViaGraphql).mockResolvedValue({
      authUrl: 'https://connect.stripe.com/setup/s/example',
    });

    await expect(initiateStripeConnect(7, '/payment-settings')).resolves.toEqual({
      authUrl: 'https://connect.stripe.com/setup/s/example',
    });
    expect(startStripeConnectViaGraphql).toHaveBeenCalledWith(
      7,
      '/payment-settings',
    );
  });

  it('disconnects through the GraphQL mutation', async () => {
    vi.mocked(disconnectStripeViaGraphql).mockResolvedValue({ success: true });

    await expect(disconnectStripeConnect(7)).resolves.toEqual({ success: true });
    expect(disconnectStripeViaGraphql).toHaveBeenCalledWith(7);
  });
});
