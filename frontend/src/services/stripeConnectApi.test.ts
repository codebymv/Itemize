import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectStripeConnect, initiateStripeConnect } from './stripeConnectApi';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('stripeConnectApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts Connect with a safe return path and tenant header', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { authUrl: 'https://connect.stripe.com/oauth/authorize' } });

    await expect(initiateStripeConnect(7, '/payment-settings')).resolves.toEqual({
      authUrl: 'https://connect.stripe.com/oauth/authorize',
    });
    expect(api.get).toHaveBeenCalledWith('/api/invoice-integrations/stripe/connect', {
      params: { return_url: '/payment-settings' },
      headers: { 'x-organization-id': '7' },
    });
  });

  it('disconnects the connected account for the current organization', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });

    await expect(disconnectStripeConnect(7)).resolves.toEqual({ success: true });
    expect(api.post).toHaveBeenCalledWith('/api/invoice-integrations/stripe/disconnect', {}, {
      headers: { 'x-organization-id': '7' },
    });
  });
});
