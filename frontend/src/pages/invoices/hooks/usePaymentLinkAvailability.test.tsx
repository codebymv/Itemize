import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaymentLinkAvailability } from './usePaymentLinkAvailability';

const mocks = vi.hoisted(() => ({
  getPaymentSettings: vi.fn(),
  useOrganization: vi.fn(),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: mocks.useOrganization,
}));

vi.mock('@/services/invoicesApi', () => ({
  getPaymentSettings: mocks.getPaymentSettings,
}));

describe('usePaymentLinkAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useOrganization.mockReturnValue({ organizationId: 42 });
  });

  it('refreshes Stripe availability whenever the send dialog opens', async () => {
    mocks.getPaymentSettings.mockResolvedValue({ stripe_connected: true });

    const { result } = renderHook(() =>
      usePaymentLinkAvailability(true, false),
    );

    await waitFor(() => expect(result.current.checkingPaymentLinks).toBe(false));

    expect(mocks.getPaymentSettings).toHaveBeenCalledWith(42);
    expect(result.current.paymentLinksAvailable).toBe(true);
    expect(result.current.paymentLinkCheckFailed).toBe(false);
  });

  it('keeps payment links disabled when Stripe is disconnected', async () => {
    mocks.getPaymentSettings.mockResolvedValue({ stripe_connected: false });

    const { result } = renderHook(() =>
      usePaymentLinkAvailability(true, true),
    );

    await waitFor(() => expect(result.current.checkingPaymentLinks).toBe(false));

    expect(result.current.paymentLinksAvailable).toBe(false);
  });

  it('does not mistake a failed status check for a verified connection', async () => {
    mocks.getPaymentSettings.mockRejectedValue(new Error('network unavailable'));

    const { result } = renderHook(() =>
      usePaymentLinkAvailability(true),
    );

    await waitFor(() => expect(result.current.checkingPaymentLinks).toBe(false));

    expect(result.current.paymentLinksAvailable).toBe(false);
    expect(result.current.paymentLinkCheckFailed).toBe(true);
  });
});
